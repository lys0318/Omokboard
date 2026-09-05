import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

// 메시지를 큐에 쌓아 순서대로 꺼내 쓰는 헬퍼.
async function connect(code, token) {
  const qs = token ? `?token=${token}` : '';
  const res = await SELF.fetch(`https://example.com/api/room/${code}${qs}`, {
    headers: { Upgrade: 'websocket' },
  });
  const ws = res.webSocket;
  ws.accept();
  const queue = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (waiters.length) waiters.shift()(msg);
    else queue.push(msg);
  });
  const next = () =>
    queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r));
  await next(); // joined 소비
  return { ws, next };
}

async function setup() {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST',
    body: JSON.stringify({ gameId: 'omok' }),
  });
  const { code, token } = await res.json();
  const a = await connect(code, token);
  const b = await connect(code);
  // 정원이 차면 서버가 먼저 있던 A에게 status:playing 을 보낸다. 소비해 둔다.
  await a.next();
  return { code, a, b };
}

describe('수 릴레이', () => {
  it('black의 수가 양쪽에 전달되고 turn이 넘어간다', async () => {
    const { a, b } = await setup();
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7', state: { x: 1 } }, seq: 1 }));
    const toA = await a.next();
    const toB = await b.next();
    expect(toA.type).toBe('move');
    expect(toA.seq).toBe(1);
    expect(toA.turn).toBe('white');
    expect(toB.move.cell).toBe('7,7');
  });

  it('move.nextTurn을 명시하면 자동 반전 대신 그 값을 쓴다(리버시 패스 지원)', async () => {
    const { a, b } = await setup();
    // 리버시처럼 패스가 있는 게임: black이 두고도 다음이 다시 black 차례인 경우
    a.ws.send(JSON.stringify({ type: 'move', move: { nextTurn: 'black' }, seq: 1 }));
    const toA = await a.next();
    const toB = await b.next();
    expect(toA.turn).toBe('black');
    expect(toB.turn).toBe('black');

    // 서버가 실제로 이 값을 저장했는지: black이 이어서 또 둘 수 있어야 한다
    a.ws.send(JSON.stringify({ type: 'move', move: {}, seq: 2 }));
    const toA2 = await a.next();
    expect(toA2.type).toBe('move');
  });

  it('남의 차례에 두면 rejected', async () => {
    const { b } = await setup();
    b.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7' }, seq: 1 }));
    const msg = await b.next();
    expect(msg.type).toBe('rejected');
    expect(msg.reason).toBe('NOT_YOUR_TURN');
  });

  it('이미 찬 칸이면 rejected', async () => {
    const { a, b } = await setup();
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7' }, seq: 1 }));
    await a.next();
    await b.next();
    b.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7' }, seq: 2 }));
    const msg = await b.next();
    expect(msg.type).toBe('rejected');
    expect(msg.reason).toBe('CELL_TAKEN');
  });

  it('seq가 어긋나면 rejected + 현재 상태 동봉', async () => {
    const { a } = await setup();
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7' }, seq: 99 }));
    const msg = await a.next();
    expect(msg.type).toBe('rejected');
    expect(msg.reason).toBe('SEQ_MISMATCH');
    expect(msg.seq).toBe(0);
  });
});
