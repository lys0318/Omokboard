import * as BB from './baseball.mjs';
import * as TJ from './ttakji.mjs';

const GRACE_MS = 120_000; // 재접속 유예 2분
const ROOM_TTL_MS = 1_800_000; // 방 유지 30분
const TURN_TIME_MS = 30_000; // 턴 제한 시간 (로컬/AI 모드와 동일)
// 시간 초과 시 "턴만 넘기기"가 게임 규칙과 맞는 게임만 켠다.
// 체스처럼 매 턴 반드시 기물을 움직여야 하는 게임은 턴만 건너뛰면 규칙이 깨진다.
const TURN_TIMER_GAMES = new Set(['omok']);

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create') return this.create(request);
    if (url.pathname === '/info') return this.info();

    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server); // Hibernation API: 유휴 시 메모리 해제
      await this.onJoin(server, url.searchParams.get('token'));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  send(ws, obj) {
    // 방금 닫힌 소켓이 getWebSockets()에 잠시 남아 있을 수 있다.
    // 여기서 던지면 onJoin 전체가 500이 되어 업그레이드가 실패한다.
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* 닫힌 소켓은 무시 */
    }
  }

  broadcast(obj) {
    for (const s of this.ctx.getWebSockets()) this.send(s, obj);
  }

  // Hibernation API: 소켓이 깨어나면 런타임이 이 메서드를 부른다.
  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'move') return this.onMove(ws, msg);
    if (msg.type === 'throw') return this.onThrow(ws, msg);
    if (msg.type === 'hit') return this.onHit(ws, msg);
    if (msg.type === 'secret' || msg.type === 'guess') return this.onBaseball(ws, msg);
    if (msg.type === 'leave') return this.onLeave(ws);
    if (msg.type === 'rematch') return this.onRematch(ws);
  }

  async onMove(ws, msg) {
    const { color } = ws.deserializeAttachment() ?? {};
    const room = await this.ctx.storage.get(['status', 'turn', 'seq', 'state', 'occupied', 'gameId']);
    const seq = room.get('seq') ?? 0;
    const turn = room.get('turn');
    const occupied = new Set(room.get('occupied') ?? []);

    const reject = (reason) =>
      this.send(ws, { type: 'rejected', reason, state: room.get('state'), seq, turn });

    // 경량 검증: seq -> 턴 -> 칸 점유. 게임 규칙 자체는 검증하지 않는다.
    if (msg.seq !== seq + 1) return reject('SEQ_MISMATCH');
    if (color !== turn) return reject('NOT_YOUR_TURN');
    if (msg.move?.cell && occupied.has(msg.move.cell)) return reject('CELL_TAKEN');

    if (msg.move?.cell) occupied.add(msg.move.cell);
    // 대부분의 게임은 매 수마다 턴이 자동으로 넘어가지만, 리버시처럼 "둘 곳이 없으면
    // 패스"가 있는 게임은 다음 턴이 자동 반전이 아닐 수 있다. 어댑터가 move.nextTurn을
    // 명시하면 그 값을 신뢰하고, 없으면(오목 등 기존 게임) 자동 반전으로 계산한다.
    const nextTurn = msg.move?.nextTurn ?? (turn === 'black' ? 'white' : 'black');
    const nextSeq = seq + 1;

    await this.ctx.storage.put({
      seq: nextSeq,
      turn: nextTurn,
      occupied: [...occupied],
      state: msg.move?.state ?? room.get('state'),
      turnDeadline: TURN_TIMER_GAMES.has(room.get('gameId')) ? Date.now() + TURN_TIME_MS : null,
      lastActivityAt: Date.now(),
    });

    this.broadcast({ type: 'move', move: msg.move, seq: nextSeq, turn: nextTurn });
    await this.rescheduleAlarm();
  }

  // 윷놀이 전용: 윷가락 4개의 앞뒤만 서버가 뽑아서 양쪽에 뿌린다.
  // 난수를 클라이언트가 만들면 조작할 수 있으므로 이것만 서버 권위로 두고,
  // 도·개·걸·윷·모·빽도 해석과 이동 규칙은 다른 게임과 같이 클라이언트에 맡긴다.
  // 던지기 자체는 턴을 넘기지 않는다(윷/모면 또 던지고, 이동까지 끝나야 턴 종료).
  async onThrow(ws, msg) {
    const { color } = ws.deserializeAttachment() ?? {};
    const room = await this.ctx.storage.get(['turn', 'seq', 'state']);
    const seq = room.get('seq') ?? 0;
    const turn = room.get('turn');

    const reject = (reason) =>
      this.send(ws, { type: 'rejected', reason, state: room.get('state'), seq, turn });

    if (msg.seq !== seq + 1) return reject('SEQ_MISMATCH');
    if (color !== turn) return reject('NOT_YOUR_TURN');

    const rnd = new Uint8Array(4);
    crypto.getRandomValues(rnd);
    const sticks = [...rnd].map((n) => n % 2 === 0);

    const nextSeq = seq + 1;
    await this.ctx.storage.put({ seq: nextSeq, lastActivityAt: Date.now() });

    this.broadcast({ type: 'throw', sticks, seq: nextSeq, turn });
    await this.rescheduleAlarm();
  }

  // 딱지치기 전용: 친 위치·세기는 그대로 돌려주고 난수(0~1)만 서버가 붙인다.
  // 뒤집혔는지는 양쪽 브라우저가 같은 식으로 계산하고, 친 쪽이 move로 다음 차례를 보낸다.
  async onHit(ws, msg) {
    const { color } = ws.deserializeAttachment() ?? {};
    const room = await this.ctx.storage.get(['turn', 'seq', 'state']);
    const seq = room.get('seq') ?? 0;
    const turn = room.get('turn');

    const reject = (reason) =>
      this.send(ws, { type: 'rejected', reason, state: room.get('state'), seq, turn });

    if (msg.seq !== seq + 1) return reject('SEQ_MISMATCH');
    if (color !== turn) return reject('NOT_YOUR_TURN');
    if (!TJ.isValidShot(msg.x, msg.y, msg.power)) return reject('BAD_SHOT');

    const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const nextSeq = seq + 1;
    await this.ctx.storage.put({ seq: nextSeq, lastActivityAt: Date.now() });

    this.broadcast({ type: 'hit', by: color, x: msg.x, y: msg.y, power: msg.power, roll, seq: nextSeq, turn });
    await this.rescheduleAlarm();
  }

  // 숫자야구 전용: 비밀 숫자는 서버만 안다. 공개 상태(state)와 다른 키(secrets)에 저장하고,
  // 양쪽에는 판정 결과만 보낸다(끝났을 때만 양쪽 숫자 공개). 판정·승패 규칙은 baseball.mjs.
  // 두 사람이 거의 동시에 숫자를 정해도 준비 표시가 덮어써지지 않게 blockConcurrencyWhile로 묶는다.
  async onBaseball(ws, msg) {
    const { color } = ws.deserializeAttachment() ?? {};
    const out = await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get(['gameId', 'status', 'turn', 'seq', 'state', 'secrets']);
      if (room.get('gameId') !== BB.GAME_ID) return null;
      const state = room.get('state');
      const seq = room.get('seq') ?? 0;
      const turn = room.get('turn');
      const secrets = room.get('secrets') ?? {};
      const reject = (reason) => ({ self: true, msg: { type: 'rejected', reason, state, seq, turn } });
      if (!color || room.get('status') !== 'playing') return reject('NOT_PLAYING');

      if (msg.type === 'secret') {
        const r = BB.applySecret(state, color, msg.secret, !!secrets[color]);
        if (r.error) return reject(r.error);
        const nextTurn = r.turn ?? turn;
        await this.ctx.storage.put({
          state: r.state, secrets: { ...secrets, [color]: msg.secret }, turn: nextTurn, lastActivityAt: Date.now(),
        });
        return { msg: { type: 'bb_ready', color, state: r.state, turn: nextTurn, seq } };
      }

      if (msg.seq !== seq + 1) return reject('SEQ_MISMATCH');
      if (color !== turn) return reject('NOT_YOUR_TURN');
      const r = BB.applyGuess(state, color, msg.guess, secrets);
      if (r.error) return reject(r.error);
      const nextSeq = seq + 1;
      const nextTurn = r.turn ?? turn;
      await this.ctx.storage.put({ state: r.state, seq: nextSeq, turn: nextTurn, lastActivityAt: Date.now() });
      const last = r.state.history[r.state.history.length - 1];
      const reveal = r.state.phase === 'over' ? { secrets } : {};
      return { msg: { type: 'bb_guess', ...last, state: r.state, turn: nextTurn, seq: nextSeq, ...reveal } };
    });
    if (!out) return;
    if (out.self) this.send(ws, out.msg);
    else this.broadcast(out.msg);
    await this.rescheduleAlarm();
  }

  // 대국 종료 후 "나가기": 접속 끊김(재접속 유예)과 달리 자리를 즉시 비운다.
  // 남은 플레이어는 새 상대를 기다리는 대기방으로 돌아간다(같은 방 코드 유지).
  async onLeave(ws) {
    const { color } = ws.deserializeAttachment() ?? {};
    if (!color) return;

    const room = await this.ctx.storage.get(['players', 'gameId', 'state']);
    const players = room.get('players');
    if (players) players[color] = null; // 자리 즉시 비움 — webSocketClose가 유예 처리를 하지 않도록
    // 숫자야구는 새 상대가 와도 같은 자릿수로 시작해야 하므로 자릿수를 남긴다.
    const bb = room.get('gameId') === BB.GAME_ID;
    const tj = room.get('gameId') === TJ.GAME_ID;

    await this.ctx.storage.put({
      players,
      status: 'waiting',
      turn: 'black',
      seq: 0,
      occupied: [],
      state: bb ? BB.initialState(room.get('state')?.digits) : tj ? TJ.initialState() : null,
      first: 'black',
      secrets: {},
      rematchReady: {},
      graceDeadline: null,
      turnDeadline: null,
      lastActivityAt: Date.now(),
    });
    await this.rescheduleAlarm();

    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      this.send(other, { type: 'status', status: 'waiting', reason: 'OPPONENT_LEFT_ROOM' });
    }
    ws.close(1000, 'LEFT'); // 클라이언트가 이 사유를 보면 재접속을 시도하지 않는다
  }

  // 재대결: 두 플레이어 모두 요청해야 판이 초기화된다.
  // 두 요청이 거의 동시에 도착하면 get→put 사이에 서로 끼어들 수 있어
  // (둘 다 상대의 ready를 못 본 채로 판정) blockConcurrencyWhile로 원자적으로 묶는다.
  async onRematch(ws) {
    const { color } = ws.deserializeAttachment() ?? {};
    if (!color) return;

    const started = await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get(['rematchReady', 'players', 'gameId', 'state', 'first']);
      const players = room.get('players');
      const ready = { ...(room.get('rematchReady') ?? {}), [color]: true };
      const bothReady = !!(players?.black && players?.white && ready.black && ready.white);

      if (bothReady) {
        // 숫자야구: 자릿수는 그대로, 선공은 판마다 바꾸고, 지난 판 숫자는 지운다.
        // 딱지치기: 5:5로 돌아가고 선공은 판마다 바꾼다(선공은 상태 밖 first에 둔다).
        const bb = room.get('gameId') === BB.GAME_ID;
        const tj = room.get('gameId') === TJ.GAME_ID;
        const prev = room.get('state');
        const prevFirst = bb ? prev?.first : (room.get('first') ?? 'black');
        const first = (bb || tj) && prevFirst === 'black' ? 'white' : 'black';
        const state = bb ? BB.initialState(prev?.digits, first) : tj ? TJ.initialState() : null;
        await this.ctx.storage.put({
          status: 'playing',
          turn: first,
          first,
          seq: 0,
          occupied: [],
          state,
          secrets: {},
          rematchReady: {},
          turnDeadline: TURN_TIMER_GAMES.has(room.get('gameId')) ? Date.now() + TURN_TIME_MS : null,
          lastActivityAt: Date.now(),
        });
        return { turn: first, state: state ?? undefined };
      }
      await this.ctx.storage.put({ rematchReady: ready });
      return null;
    });

    if (started) {
      this.broadcast({ type: 'rematch_start', ...started });
      return;
    }
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      this.send(other, { type: 'rematch_wait', color });
    }
  }

  // 알람은 DO당 하나뿐이다. 유예·만료·턴 타임아웃 중 이른 시각을 쓴다.
  // 턴 타임아웃은 playing 상태일 때만 후보로 넣는다 — 상대가 끊겨 paused가 되면
  // 유예(2분)만 남고 턴 시계는 자연히 멈춘다.
  nextAlarmAt({ graceDeadline, roomExpiresAt, turnDeadline, status }) {
    const candidates = [roomExpiresAt];
    if (graceDeadline != null) candidates.push(graceDeadline);
    if (status === 'playing' && turnDeadline != null) candidates.push(turnDeadline);
    return Math.min(...candidates);
  }

  async rescheduleAlarm() {
    const r = await this.ctx.storage.get(['graceDeadline', 'roomExpiresAt', 'turnDeadline', 'status']);
    const at = this.nextAlarmAt({
      graceDeadline: r.get('graceDeadline') ?? null,
      roomExpiresAt: r.get('roomExpiresAt') ?? Date.now() + ROOM_TTL_MS,
      turnDeadline: r.get('turnDeadline') ?? null,
      status: r.get('status'),
    });
    await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const r = await this.ctx.storage.get([
      'status', 'graceDeadline', 'roomExpiresAt', 'turnDeadline', 'turn', 'seq',
    ]);
    const now = Date.now();
    const status = r.get('status');
    const grace = r.get('graceDeadline');

    // 유예 마감이 먼저 도래한 경우
    if (status === 'paused' && grace != null && now >= grace) {
      await this.ctx.storage.put({ status: 'finished', graceDeadline: null, turnDeadline: null });
      this.broadcast({ type: 'status', status: 'finished', reason: 'OPPONENT_LEFT' });
      await this.rescheduleAlarm();
      return;
    }
    // 방 만료
    if (now >= (r.get('roomExpiresAt') ?? 0)) {
      this.broadcast({ type: 'status', status: 'finished', reason: 'ROOM_EXPIRED' });
      await this.ctx.storage.deleteAll();
      return;
    }
    // 턴 시간 초과 — 승패 처리 없이 턴만 넘긴다
    const turnDeadline = r.get('turnDeadline');
    if (status === 'playing' && turnDeadline != null && now >= turnDeadline) {
      const nextTurn = r.get('turn') === 'black' ? 'white' : 'black';
      const nextSeq = (r.get('seq') ?? 0) + 1;
      await this.ctx.storage.put({
        turn: nextTurn,
        seq: nextSeq,
        turnDeadline: now + TURN_TIME_MS,
        lastActivityAt: now,
      });
      this.broadcast({ type: 'timeout', seq: nextSeq, turn: nextTurn });
    }
    await this.rescheduleAlarm();
  }

  async webSocketClose(ws) {
    const { color } = ws.deserializeAttachment() ?? {};
    if (!color) return;

    // 같은 좌석에 살아 있는 다른 소켓이 있으면 이 close는 교체된 옛 소켓의 것이다.
    // 좌석을 끊김 처리하면 안 된다(나중 연결이 이김).
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const att = other.deserializeAttachment();
      if (att && att.color === color) return;
    }

    const players = await this.ctx.storage.get('players');
    if (!players?.[color]) return;
    players[color].connected = false;

    const graceDeadline = Date.now() + GRACE_MS;
    await this.ctx.storage.put({ players, status: 'paused', graceDeadline });
    await this.rescheduleAlarm();

    this.broadcast({ type: 'opponent', event: 'left' });
    this.broadcast({ type: 'status', status: 'paused', endsAt: graceDeadline });
  }

  async onJoin(ws, token) {
    const initialized = await this.ctx.storage.get('initialized');

    // DO는 idFromName으로 항상 생성되므로 initialized로 "없는 방"을 구분한다.
    if (!initialized) {
      this.send(ws, { type: 'error', code: 'ROOM_NOT_FOUND' });
      ws.close(1008, 'ROOM_NOT_FOUND');
      await this.ctx.storage.deleteAll(); // 오타 코드로 생긴 빈 방 정리
      return;
    }

    // 좌석 배정(읽기→계산→쓰기)이 원자적이지 않으면, 두 사람이 공유 링크를 받고
    // 거의 동시에 접속할 때 get→put 사이에 서로 끼어들어 상대의 좌석 배정을
    // 덮어쓸 수 있다(부하 테스트로 실제 재현됨) — blockConcurrencyWhile로 묶는다.
    const result = await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get(['status', 'turn', 'seq', 'state', 'players', 'gameId', 'secrets']);
      const players = room.get('players');
      let color = null;

      // 1) 토큰이 맞으면 원래 자리로 복귀
      for (const seat of ['black', 'white']) {
        if (players[seat] && token && players[seat].token === token) color = seat;
      }
      // 2) 아니면 빈 자리
      if (!color) {
        if (!players.black) color = 'black';
        else if (!players.white) color = 'white';
      }
      if (!color) return { error: 'ROOM_FULL' };

      const seatToken = players[color]?.token ?? crypto.randomUUID();
      players[color] = { token: seatToken, connected: true };

      const status = players.black && players.white ? 'playing' : 'waiting';
      const wasPaused = room.get('status') === 'paused';
      await this.ctx.storage.put({
        players,
        status,
        graceDeadline: null, // 돌아왔으니 유예 해제
        turnDeadline: status === 'playing' && TURN_TIMER_GAMES.has(room.get('gameId')) ? Date.now() + TURN_TIME_MS : null,
        roomExpiresAt: Date.now() + ROOM_TTL_MS,
        lastActivityAt: Date.now(),
      });
      return {
        color, seatToken, status, wasPaused,
        state: room.get('state'), seq: room.get('seq'), turn: room.get('turn'),
        secret: (room.get('secrets') ?? {})[color], // 숫자야구: 재접속한 사람에게 자기 숫자만
      };
    });

    if (result.error) {
      this.send(ws, { type: 'error', code: result.error });
      ws.close(1008, result.error);
      return;
    }
    const { color, seatToken, status, wasPaused, state, seq, turn, secret } = result;

    // 같은 좌석에 이미 붙어 있는 소켓은 닫는다. 나중 연결이 이긴다.
    // (모바일에서 새로고침을 반복하면 유령 소켓이 남는다)
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const att = other.deserializeAttachment();
      if (att && att.color === color) other.close(1000, 'REPLACED');
    }
    ws.serializeAttachment({ color });

    await this.rescheduleAlarm();
    if (wasPaused) this.broadcast({ type: 'opponent', event: 'reconnected' });

    this.send(ws, {
      type: 'joined',
      color,
      token: seatToken,
      status,
      state,
      seq,
      turn, // 턴은 서버가 권위를 갖는다 (state.turn은 착수 시점 값이라 밀림)
      secret, // 숫자야구만 값이 있다 (다른 게임은 undefined라 JSON에서 빠진다)
    });

    // 정원이 찼으면 먼저 와서 기다리던 쪽에도 시작을 알린다.
    // (joined는 접속한 소켓에만 가므로 이게 없으면 방장 화면이 "대기 중"에 멈춘다)
    if (status === 'playing') {
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        this.send(other, { type: 'status', status: 'playing' });
      }
    }
  }

  // 좌석을 배정하지 않고 이 코드가 어떤 게임인지만 확인한다. 틱택토처럼 한
  // 페이지에 서로 다른 게임 엔진(클래식/얼티메이트)이 걸려 있을 때, 코드를
  // 직접 입력해 입장하는 쪽이 방장과 다른 화면으로 잘못 들어가지 않도록
  // 클라이언트가 화면을 고르기 전에 먼저 물어보는 용도.
  async info() {
    const initialized = await this.ctx.storage.get('initialized');
    if (!initialized) {
      return new Response(JSON.stringify({ error: 'ROOM_NOT_FOUND' }), { status: 404 });
    }
    const gameId = await this.ctx.storage.get('gameId');
    return Response.json({ gameId });
  }

  // 방을 처음 만든다. 이미 초기화됐으면 409를 준다(코드 충돌).
  async create(request) {
    const { gameId, initialState } = await request.json();
    if (await this.ctx.storage.get('initialized')) {
      return new Response(JSON.stringify({ error: 'CODE_TAKEN' }), { status: 409 });
    }
    const token = crypto.randomUUID();
    await this.ctx.storage.put({
      initialized: true,
      gameId,
      status: 'waiting',
      turn: 'black',
      seq: 0,
      // 대부분의 게임은 고정된 시작 상태라 필요 없지만, 알까기의 익스트림
      // 장애물처럼 방장이 시작 전에 고른 설정은 첫 수 전에도 입장한 쪽에
      // 전달돼야 한다 — 없으면 기존 게임과 동일하게 null.
      // 숫자야구는 클라이언트가 보낸 값 중 자릿수만 쓴다(단계·기록은 서버가 정한다).
      state: gameId === BB.GAME_ID ? BB.initialState(initialState?.digits)
        : gameId === TJ.GAME_ID ? TJ.initialState() : (initialState ?? null),
      players: { black: { token, connected: false }, white: null },
      lastActivityAt: Date.now(),
      roomExpiresAt: Date.now() + ROOM_TTL_MS,
      graceDeadline: null,
      turnDeadline: null,
      rematchReady: {},
    });
    // 아무도 입장하지 않은 방도 반드시 정리되도록 생성 시점에 알람을 건다.
    await this.rescheduleAlarm();
    return new Response(JSON.stringify({ token, color: 'black' }), { status: 201 });
  }
}
