import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

// 알람은 DO당 하나뿐이라 유예/만료 분기를 정확히 골라야 한다.
describe('알람 단일 슬롯', () => {
  it('유예가 만료보다 이르면 유예 시각으로 잡는다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('ALARM1'));
    await runInDurableObject(stub, async (instance) => {
      const now = 1_000_000;
      expect(
        instance.nextAlarmAt({ graceDeadline: now + 1000, roomExpiresAt: now + 99_000 })
      ).toBe(now + 1000);
    });
  });

  it('유예가 없으면 만료 시각으로 잡는다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('ALARM2'));
    await runInDurableObject(stub, async (instance) => {
      expect(instance.nextAlarmAt({ graceDeadline: null, roomExpiresAt: 555 })).toBe(555);
    });
  });

  it('유예 마감이 지났고 paused면 종료 처리한다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('ALARM3'));
    await runInDurableObject(stub, async (instance, state) => {
      await state.storage.put({
        initialized: true,
        status: 'paused',
        graceDeadline: Date.now() - 1,
        roomExpiresAt: Date.now() + 100_000,
        players: {
          black: { token: 't', connected: false },
          white: { token: 'u', connected: true },
        },
      });
      await instance.alarm();
      expect(await state.storage.get('status')).toBe('finished');
    });
  });

  it('만료 시각이 지나면 방을 정리한다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('ALARM4'));
    await runInDurableObject(stub, async (instance, state) => {
      await state.storage.put({
        initialized: true,
        status: 'waiting',
        graceDeadline: null,
        roomExpiresAt: Date.now() - 1,
        players: { black: { token: 't', connected: false }, white: null },
      });
      await instance.alarm();
      expect(await state.storage.get('initialized')).toBeUndefined();
    });
  });

  it('생성 후 아무도 입장하지 않은 방도 만료 알람이 걸린다', async () => {
    const res = await SELF.fetch('https://example.com/api/room', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'omok' }),
    });
    const { code } = await res.json();
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
  });
});
