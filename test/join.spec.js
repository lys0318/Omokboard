import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

async function createRoom() {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST',
    body: JSON.stringify({ gameId: 'omok' }),
  });
  return res.json();
}

// WebSocket을 열고 첫 메시지를 받는다.
async function connect(code, token) {
  const qs = token ? `?token=${token}` : '';
  const res = await SELF.fetch(`https://example.com/api/room/${code}${qs}`, {
    headers: { Upgrade: 'websocket' },
  });
  const ws = res.webSocket;
  ws.accept();
  const first = await new Promise((resolve) => {
    ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
  });
  return { ws, first };
}

describe('입장', () => {
  it('방장은 토큰으로 재접속하면 black을 유지한다', async () => {
    const { code, token } = await createRoom();
    const { first } = await connect(code, token);
    expect(first.type).toBe('joined');
    expect(first.color).toBe('black');
  });

  it('두 번째 사람은 white를 받는다', async () => {
    const { code, token } = await createRoom();
    await connect(code, token);
    const { first } = await connect(code);
    expect(first.type).toBe('joined');
    expect(first.color).toBe('white');
  });

  it('세 번째 사람은 ROOM_FULL', async () => {
    const { code, token } = await createRoom();
    await connect(code, token);
    await connect(code);
    const { first } = await connect(code);
    expect(first.type).toBe('error');
    expect(first.code).toBe('ROOM_FULL');
  });

  it('없는 방 코드는 ROOM_NOT_FOUND', async () => {
    const { first } = await connect('ZZZZZZ');
    expect(first.type).toBe('error');
    expect(first.code).toBe('ROOM_NOT_FOUND');
  });
});
