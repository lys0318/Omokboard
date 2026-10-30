import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

// 메시지를 큐에 쌓아 순서대로 꺼내 쓰는 헬퍼. joined 메시지도 돌려준다.
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
  let joined = await next();
  while (joined.type !== 'joined') joined = await next();
  return { ws, next, joined, send: (m) => ws.send(JSON.stringify(m)) };
}

async function setup() {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST',
    body: JSON.stringify({ gameId: 'ttakji', initialState: { counts: { black: 99, white: 0 } } }),
  });
  const { code, token } = await res.json();
  const a = await connect(code, token); // black(방장, 선공)
  const b = await connect(code); // white
  await a.next(); // status:playing 소비
  return { code, a, b };
}

describe('딱지치기 온라인 (서버는 난수만)', () => {
  it('처음 상태는 서버가 정한다 (5:5, 첫 딱지)', async () => {
    const { a } = await setup();
    expect(a.joined.state).toEqual({ counts: { black: 5, white: 5 }, k: 0 });
  });

  it('친 위치·세기는 그대로, 서버 난수(0~1)를 붙여 양쪽에 보내고 차례는 넘기지 않는다', async () => {
    const { a, b } = await setup();
    a.send({ type: 'hit', seq: 1, x: 250, y: 190, power: 0.9 });
    const toA = await a.next(), toB = await b.next();
    expect(toA).toMatchObject({ type: 'hit', by: 'black', x: 250, y: 190, power: 0.9, seq: 1, turn: 'black' });
    expect(toA.roll).toBeGreaterThanOrEqual(0);
    expect(toA.roll).toBeLessThan(1);
    expect(toB).toEqual(toA);
  });

  it('차례가 아니거나 값이 범위 밖이면 거부한다', async () => {
    const { a, b } = await setup();
    b.send({ type: 'hit', seq: 1, x: 200, y: 200, power: 0.5 });
    expect((await b.next()).reason).toBe('NOT_YOUR_TURN');
    for (const bad of [{ x: -5, y: 200, power: 0.5 }, { x: 200, y: 401, power: 0.5 }, { x: 200, y: 200, power: 1.5 }, { x: '200', y: 200, power: 0.5 }]) {
      a.send({ type: 'hit', seq: 1, ...bad });
      expect((await a.next()).reason).toBe('BAD_SHOT');
    }
  });

  it('친 뒤 move로 다음 차례를 넘긴다', async () => {
    const { a, b } = await setup();
    a.send({ type: 'hit', seq: 1, x: 200, y: 200, power: 0.1 }); await a.next(); await b.next();
    a.send({ type: 'move', seq: 2, move: { nextTurn: 'white', state: { counts: { black: 5, white: 5 }, k: 0 } } });
    const m = await b.next();
    expect(m).toMatchObject({ type: 'move', seq: 2, turn: 'white' });
    b.send({ type: 'hit', seq: 3, x: 200, y: 200, power: 0.5 });
    expect((await b.next()).type).toBe('hit');
  });

  it('재대결마다 선공이 바뀌고 장 수가 5:5로 돌아간다', async () => {
    const { a, b } = await setup();
    a.send({ type: 'rematch' }); await b.next(); // rematch_wait
    b.send({ type: 'rematch' });
    const r1 = await a.next(); await b.next();
    expect(r1).toMatchObject({ type: 'rematch_start', turn: 'white', state: { counts: { black: 5, white: 5 }, k: 0 } });

    a.send({ type: 'rematch' }); await b.next();
    b.send({ type: 'rematch' });
    const r2 = await a.next(); await b.next();
    expect(r2.turn).toBe('black');
  });
});
