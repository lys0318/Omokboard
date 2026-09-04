const GRACE_MS = 120_000; // 재접속 유예 2분
const ROOM_TTL_MS = 1_800_000; // 방 유지 30분
const TURN_TIME_MS = 30_000; // 턴 제한 시간 (로컬/AI 모드와 동일)

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create') return this.create(request);

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
    if (msg.type === 'leave') return this.onLeave(ws);
    if (msg.type === 'rematch') return this.onRematch(ws);
  }

  async onMove(ws, msg) {
    const { color } = ws.deserializeAttachment() ?? {};
    const room = await this.ctx.storage.get(['status', 'turn', 'seq', 'state', 'occupied']);
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
    const nextTurn = turn === 'black' ? 'white' : 'black';
    const nextSeq = seq + 1;

    await this.ctx.storage.put({
      seq: nextSeq,
      turn: nextTurn,
      occupied: [...occupied],
      state: msg.move?.state ?? room.get('state'),
      turnDeadline: Date.now() + TURN_TIME_MS,
      lastActivityAt: Date.now(),
    });

    this.broadcast({ type: 'move', move: msg.move, seq: nextSeq, turn: nextTurn });
    await this.rescheduleAlarm();
  }

  // 대국 종료 후 "나가기": 접속 끊김(재접속 유예)과 달리 자리를 즉시 비운다.
  // 남은 플레이어는 새 상대를 기다리는 대기방으로 돌아간다(같은 방 코드 유지).
  async onLeave(ws) {
    const { color } = ws.deserializeAttachment() ?? {};
    if (!color) return;

    const players = await this.ctx.storage.get('players');
    if (players) players[color] = null; // 자리 즉시 비움 — webSocketClose가 유예 처리를 하지 않도록

    await this.ctx.storage.put({
      players,
      status: 'waiting',
      turn: 'black',
      seq: 0,
      occupied: [],
      state: null,
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

    const bothReady = await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get(['rematchReady', 'players']);
      const players = room.get('players');
      const ready = { ...(room.get('rematchReady') ?? {}), [color]: true };
      const bothReady = !!(players?.black && players?.white && ready.black && ready.white);

      if (bothReady) {
        await this.ctx.storage.put({
          status: 'playing',
          turn: 'black',
          seq: 0,
          occupied: [],
          state: null,
          rematchReady: {},
          turnDeadline: Date.now() + TURN_TIME_MS,
          lastActivityAt: Date.now(),
        });
      } else {
        await this.ctx.storage.put({ rematchReady: ready });
      }
      return bothReady;
    });

    if (bothReady) {
      this.broadcast({ type: 'rematch_start', turn: 'black' });
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
      const room = await this.ctx.storage.get(['status', 'turn', 'seq', 'state', 'players']);
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
        turnDeadline: status === 'playing' ? Date.now() + TURN_TIME_MS : null,
        roomExpiresAt: Date.now() + ROOM_TTL_MS,
        lastActivityAt: Date.now(),
      });
      return {
        color, seatToken, status, wasPaused,
        state: room.get('state'), seq: room.get('seq'), turn: room.get('turn'),
      };
    });

    if (result.error) {
      this.send(ws, { type: 'error', code: result.error });
      ws.close(1008, result.error);
      return;
    }
    const { color, seatToken, status, wasPaused, state, seq, turn } = result;

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

  // 방을 처음 만든다. 이미 초기화됐으면 409를 준다(코드 충돌).
  async create(request) {
    const { gameId } = await request.json();
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
      state: null,
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
