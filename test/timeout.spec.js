import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

// 메시지를 큐에 쌓아 순서대로 꺼내 쓰는 헬퍼. (move.spec.js와 동일 패턴)
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

async function setup(gameId = 'omok') {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST',
    body: JSON.stringify({ gameId }),
  });
  const { code, token } = await res.json();
  const a = await connect(code, token);
  const b = await connect(code);
  await a.next(); // status:playing 소비
  return { code, a, b };
}

describe('턴 타임아웃', () => {
  it('playing 중엔 turnDeadline이 가장 이르면 그 시각을 고른다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('TO1'));
    await runInDurableObject(stub, async (instance) => {
      const now = 1_000_000;
      expect(
        instance.nextAlarmAt({
          status: 'playing',
          graceDeadline: null,
          roomExpiresAt: now + 999_000,
          turnDeadline: now + 500,
        })
      ).toBe(now + 500);
    });
  });

  it('paused 상태면 turnDeadline이 있어도 후보에서 뺀다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('TO2'));
    await runInDurableObject(stub, async (instance) => {
      const now = 1_000_000;
      expect(
        instance.nextAlarmAt({
          status: 'paused',
          graceDeadline: now + 2000,
          roomExpiresAt: now + 999_000,
          turnDeadline: now + 500,
        })
      ).toBe(now + 2000);
    });
  });

  it('onMove 성공 시 turnDeadline이 30초 뒤로 갱신된다', async () => {
    const { code, a } = await setup();
    const before = Date.now();
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7' }, seq: 1 }));
    await a.next();

    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      const turnDeadline = await state.storage.get('turnDeadline');
      expect(turnDeadline).toBeGreaterThanOrEqual(before + 29_000);
      expect(turnDeadline).toBeLessThanOrEqual(before + 31_000);
    });
  });

  it('턴 시간이 지나면 알람이 턴을 넘기고 양쪽에 timeout을 브로드캐스트한다', async () => {
    const { code, a, b } = await setup();

    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    await runInDurableObject(stub, async (instance, state) => {
      await state.storage.put({ turnDeadline: Date.now() - 1 });
      await instance.alarm();
    });

    const toA = await a.next();
    const toB = await b.next();
    expect(toA.type).toBe('timeout');
    expect(toA.turn).toBe('white');
    expect(toA.seq).toBe(1);
    expect(toB.type).toBe('timeout');
  });

  it('타이머를 지원하지 않는 게임(체스)은 정원이 차도 turnDeadline을 설정하지 않는다', async () => {
    const { code } = await setup('chess');
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get('turnDeadline')).toBeNull();
      expect(await state.storage.get('status')).toBe('playing');
    });
  });

  it('타이머를 지원하지 않는 게임은 수를 둬도 turnDeadline이 계속 null이다', async () => {
    const { code, a } = await setup('chess');
    a.ws.send(JSON.stringify({ type: 'move', move: { from: 'e2', to: 'e4' }, seq: 1 }));
    await a.next();

    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get('turnDeadline')).toBeNull();
    });
  });

  it('paused 상태면 턴 시간이 지나도 턴을 넘기지 않는다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('TO5'));
    await runInDurableObject(stub, async (instance, state) => {
      await state.storage.put({
        initialized: true,
        status: 'paused',
        turn: 'black',
        seq: 0,
        turnDeadline: Date.now() - 1,
        graceDeadline: Date.now() + 100_000,
        roomExpiresAt: Date.now() + 999_000,
        players: {
          black: { token: 't', connected: false },
          white: { token: 'u', connected: true },
        },
      });
      await instance.alarm();
      expect(await state.storage.get('turn')).toBe('black');
      expect(await state.storage.get('seq')).toBe(0);
    });
  });
});
