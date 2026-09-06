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
    body: JSON.stringify({ gameId: 'yut' }),
  });
  const { code, token } = await res.json();
  const a = await connect(code, token);
  const b = await connect(code);
  await a.next(); // status:playing 소비
  return { code, a, b };
}

describe('윷 던지기(서버 난수)', () => {
  it('윷가락 4개를 양쪽에 뿌리고, 던지기만으로는 턴이 넘어가지 않는다', async () => {
    const { a, b } = await setup();
    a.ws.send(JSON.stringify({ type: 'throw', seq: 1 }));
    const toA = await a.next();
    const toB = await b.next();

    expect(toA.type).toBe('throw');
    expect(toA.sticks).toHaveLength(4);
    expect(toA.sticks.every((v) => typeof v === 'boolean')).toBe(true);
    expect(toA.seq).toBe(1);
    // 윷/모면 한 번 더 던져야 하므로 던지기 자체는 턴을 넘기지 않는다.
    expect(toA.turn).toBe('black');
    expect(toB).toEqual(toA);
  });

  it('상대 차례에는 던질 수 없다', async () => {
    const { a, b } = await setup();
    b.ws.send(JSON.stringify({ type: 'throw', seq: 1 })); // white인데 turn은 black
    const toB = await b.next();
    expect(toB.type).toBe('rejected');
    expect(toB.reason).toBe('NOT_YOUR_TURN');
  });

  it('seq가 어긋나면 거부한다', async () => {
    const { a } = await setup();
    a.ws.send(JSON.stringify({ type: 'throw', seq: 7 }));
    const toA = await a.next();
    expect(toA.type).toBe('rejected');
    expect(toA.reason).toBe('SEQ_MISMATCH');
  });

  it('던진 뒤 이어서 낸 수는 seq가 이어지고 턴을 넘긴다', async () => {
    const { a, b } = await setup();
    a.ws.send(JSON.stringify({ type: 'throw', seq: 1 }));
    await a.next();
    await b.next();

    a.ws.send(JSON.stringify({ type: 'move', move: { nextTurn: 'white', state: { t: 1 } }, seq: 2 }));
    const toA = await a.next();
    expect(toA.type).toBe('move');
    expect(toA.seq).toBe(2);
    expect(toA.turn).toBe('white');
  });
});
