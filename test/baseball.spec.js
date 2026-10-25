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
  // 재접속하면 서버가 "상대 재접속" 알림을 joined보다 먼저 보낼 수 있다.
  let joined = await next();
  while (joined.type !== 'joined') joined = await next();
  return { ws, next, joined, send: (m) => ws.send(JSON.stringify(m)) };
}

async function setup(digits = 3) {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST',
    // 클라이언트가 단계(phase) 같은 걸 실어 보내도 서버는 자릿수만 쓴다.
    body: JSON.stringify({ gameId: 'number-baseball', initialState: { digits, phase: 'over', history: [1] } }),
  });
  const { code, token } = await res.json();
  const a = await connect(code, token); // black(선공)
  const b = await connect(code); // white
  await a.next(); // status:playing 소비
  return { code, a, b };
}

// 두 사람 숫자를 정해 게임을 시작한다 (black=123, white=456).
async function start(digits = 3) {
  const s = await setup(digits);
  s.a.send({ type: 'secret', secret: digits === 4 ? '1234' : '123' });
  await s.a.next(); await s.b.next(); // bb_ready(black)
  s.b.send({ type: 'secret', secret: digits === 4 ? '5678' : '456' });
  await s.a.next(); await s.b.next(); // bb_ready(white) → playing
  return s;
}

const leaks = (msg, secret) => JSON.stringify(msg).includes(secret);

describe('숫자야구 온라인 (서버 판정)', () => {
  it('처음 상태는 자릿수만 클라이언트 값을 쓴다', async () => {
    const { a } = await setup();
    expect(a.joined.state).toMatchObject({ digits: 3, phase: 'setup', first: 'black', history: [] });
  });

  it('비밀 숫자는 상대에게 보내지 않고, 둘 다 정하면 선공 차례로 시작한다', async () => {
    const { a, b } = await setup();
    a.send({ type: 'secret', secret: '123' });
    const toA = await a.next(), toB = await b.next();
    expect(toB).toMatchObject({ type: 'bb_ready', color: 'black' });
    expect(leaks(toB, '123')).toBe(false);
    expect(toA.state.phase).toBe('setup');

    b.send({ type: 'secret', secret: '456' });
    const a2 = await a.next(), b2 = await b.next();
    expect(a2).toMatchObject({ type: 'bb_ready', color: 'white', turn: 'black' });
    expect(a2.state.phase).toBe('playing');
    expect(leaks(a2, '456')).toBe(false);
    expect(b2).toEqual(a2);
  });

  it('판정 결과만 양쪽에 보낸다', async () => {
    const { a, b } = await start();
    a.send({ type: 'guess', seq: 1, guess: '465' }); // 상대 456 → 4는 스트라이크, 6·5는 볼
    const toA = await a.next(), toB = await b.next();
    expect(toA).toMatchObject({ type: 'bb_guess', color: 'black', guess: '465', strikes: 1, balls: 2, turn: 'white', seq: 1 });
    expect(toA.secrets).toBeUndefined();
    expect(leaks(toA, '456') || leaks(toA, '123')).toBe(false);
    expect(toB).toEqual(toA);
  });

  it('차례·형식·단계가 틀리면 거부한다', async () => {
    const { a, b } = await setup();
    a.send({ type: 'guess', seq: 1, guess: '123' });
    expect((await a.next()).reason).toBe('BAD_PHASE');
    a.send({ type: 'secret', secret: '112' });
    expect((await a.next()).reason).toBe('BAD_NUMBER');

    a.send({ type: 'secret', secret: '123' }); await a.next(); await b.next();
    b.send({ type: 'secret', secret: '456' }); await a.next(); await b.next();
    b.send({ type: 'guess', seq: 1, guess: '123' });
    expect((await b.next()).reason).toBe('NOT_YOUR_TURN');
    a.send({ type: 'guess', seq: 1, guess: '12' });
    const bad = await a.next();
    expect(bad.reason).toBe('BAD_NUMBER');
    expect(leaks(bad, '456')).toBe(false);
  });

  it('선공이 맞히면 후공에게 마지막 기회, 후공이 못 맞히면 선공 승리 + 양쪽 숫자 공개', async () => {
    const { a, b } = await start();
    a.send({ type: 'guess', seq: 1, guess: '456' });
    const hit = await a.next(); await b.next();
    expect(hit).toMatchObject({ strikes: 3, turn: 'white' });
    expect(hit.state.phase).toBe('final');
    expect(hit.secrets).toBeUndefined();

    b.send({ type: 'guess', seq: 2, guess: '789' });
    const end = await b.next(); await a.next();
    expect(end.state).toMatchObject({ phase: 'over', result: 'black' });
    expect(end.secrets).toEqual({ black: '123', white: '456' });
  });

  it('둘 다 같은 횟수에 맞히면 무승부', async () => {
    const { a, b } = await start();
    a.send({ type: 'guess', seq: 1, guess: '456' }); await a.next(); await b.next();
    b.send({ type: 'guess', seq: 2, guess: '123' });
    const end = await b.next(); await a.next();
    expect(end.state).toMatchObject({ phase: 'over', result: 'draw' });
  });

  it('후공이 먼저 맞히면 후공 승리', async () => {
    const { a, b } = await start();
    a.send({ type: 'guess', seq: 1, guess: '789' }); await a.next(); await b.next();
    b.send({ type: 'guess', seq: 2, guess: '123' });
    const end = await b.next(); await a.next();
    expect(end.state).toMatchObject({ phase: 'over', result: 'white' });
  });

  it('재접속하면 공개 기록과 내 숫자만 받는다', async () => {
    const { code, a, b } = await start();
    a.send({ type: 'guess', seq: 1, guess: '465' }); await a.next(); await b.next();
    const token = b.joined.token;
    b.ws.close();
    await a.next(); await a.next(); // opponent left, status paused
    const b2 = await connect(code, token);
    expect(b2.joined.secret).toBe('456');
    expect(leaks(b2.joined, '123')).toBe(false);
    expect(b2.joined.state.history).toHaveLength(1);
  });

  it('재대결은 숫자를 비우고 선공을 바꾼다', async () => {
    const { a, b } = await start();
    a.send({ type: 'guess', seq: 1, guess: '789' }); await a.next(); await b.next();
    b.send({ type: 'guess', seq: 2, guess: '123' }); await a.next(); await b.next(); // white 승

    a.send({ type: 'rematch' }); await b.next(); // rematch_wait
    b.send({ type: 'rematch' });
    const ra = await a.next();
    expect(ra).toMatchObject({ type: 'rematch_start', turn: 'white' });
    expect(ra.state).toMatchObject({ phase: 'setup', first: 'white', history: [] });
    await b.next();

    // 숫자를 다시 정할 수 있어야 한다 (이전 숫자가 남아 있으면 ALREADY_SET)
    a.send({ type: 'secret', secret: '987' });
    expect((await a.next()).type).toBe('bb_ready');
  });

  it('4자리 방은 4자리 숫자만 받는다', async () => {
    const { a, b } = await start(4);
    a.send({ type: 'guess', seq: 1, guess: '123' });
    expect((await a.next()).reason).toBe('BAD_NUMBER');
    a.send({ type: 'guess', seq: 1, guess: '8765' });
    const r = await a.next(); await b.next();
    expect(r).toMatchObject({ strikes: 0, balls: 4 });
  });
});
