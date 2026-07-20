const GRACE_MS = 120_000; // 재접속 유예 2분
const ROOM_TTL_MS = 1_800_000; // 방 유지 30분

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
    ws.send(JSON.stringify(obj));
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
  }

  async onMove(ws, msg) {
    const { color } = ws.deserializeAttachment() ?? {};
    const room = await this.ctx.storage.get(['status', 'turn', 'seq', 'state', 'occupied']);
    const seq = room.get('seq') ?? 0;
    const turn = room.get('turn');
    const occupied = new Set(room.get('occupied') ?? []);

    const reject = (reason) =>
      this.send(ws, { type: 'rejected', reason, state: room.get('state'), seq });

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
      lastActivityAt: Date.now(),
    });

    this.broadcast({ type: 'move', move: msg.move, seq: nextSeq, turn: nextTurn });
  }

  // 알람은 DO당 하나뿐이다. 유예와 만료 중 이른 시각을 쓴다.
  nextAlarmAt({ graceDeadline, roomExpiresAt }) {
    return Math.min(graceDeadline ?? Infinity, roomExpiresAt);
  }

  async rescheduleAlarm() {
    const r = await this.ctx.storage.get(['graceDeadline', 'roomExpiresAt']);
    const at = this.nextAlarmAt({
      graceDeadline: r.get('graceDeadline') ?? null,
      roomExpiresAt: r.get('roomExpiresAt') ?? Date.now() + ROOM_TTL_MS,
    });
    await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const r = await this.ctx.storage.get(['status', 'graceDeadline', 'roomExpiresAt']);
    const now = Date.now();
    const grace = r.get('graceDeadline');

    // 유예 마감이 먼저 도래한 경우
    if (r.get('status') === 'paused' && grace != null && now >= grace) {
      await this.ctx.storage.put({ status: 'finished', graceDeadline: null });
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
    await this.rescheduleAlarm();
  }

  async webSocketClose(ws) {
    const { color } = ws.deserializeAttachment() ?? {};
    if (!color) return;
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
    const room = await this.ctx.storage.get([
      'initialized', 'status', 'turn', 'seq', 'state', 'players',
    ]);

    // DO는 idFromName으로 항상 생성되므로 initialized로 "없는 방"을 구분한다.
    if (!room.get('initialized')) {
      this.send(ws, { type: 'error', code: 'ROOM_NOT_FOUND' });
      ws.close(1008, 'ROOM_NOT_FOUND');
      await this.ctx.storage.deleteAll(); // 오타 코드로 생긴 빈 방 정리
      return;
    }

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
    if (!color) {
      this.send(ws, { type: 'error', code: 'ROOM_FULL' });
      ws.close(1008, 'ROOM_FULL');
      return;
    }

    const seatToken = players[color]?.token ?? crypto.randomUUID();
    players[color] = { token: seatToken, connected: true };
    ws.serializeAttachment({ color });

    const status = players.black && players.white ? 'playing' : 'waiting';
    const wasPaused = room.get('status') === 'paused';
    await this.ctx.storage.put({
      players,
      status,
      graceDeadline: null, // 돌아왔으니 유예 해제
      roomExpiresAt: Date.now() + ROOM_TTL_MS,
      lastActivityAt: Date.now(),
    });
    await this.rescheduleAlarm();
    if (wasPaused) this.broadcast({ type: 'opponent', event: 'reconnected' });

    this.send(ws, {
      type: 'joined',
      color,
      token: seatToken,
      status,
      state: room.get('state'),
      seq: room.get('seq'),
    });
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
    });
    // 아무도 입장하지 않은 방도 반드시 정리되도록 생성 시점에 알람을 건다.
    await this.rescheduleAlarm();
    return new Response(JSON.stringify({ token, color: 'black' }), { status: 201 });
  }
}
