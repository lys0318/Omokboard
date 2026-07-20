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

describe('같은 좌석 중복 접속', () => {
  it('같은 토큰으로 다시 붙으면 기존 소켓이 닫힌다(나중 연결이 이김)', async () => {
    const res = await SELF.fetch('https://example.com/api/room', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'omok' }),
    });
    const { code, token } = await res.json();

    const first = await connect(code, token);
    const closed = new Promise((resolve) => {
      first.ws.addEventListener('close', () => resolve(true), { once: true });
    });

    await connect(code, token); // 같은 토큰으로 재접속
    expect(await closed).toBe(true);
  });
});

describe('턴 권위', () => {
  it('joined에 서버 turn이 포함되고, 한 수 뒤 재접속 시 다음 차례가 온다', async () => {
    const res = await SELF.fetch('https://example.com/api/room', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'omok' }),
    });
    const { code, token } = await res.json();

    const a = await connect(code, token);
    expect(a.first.turn).toBe('black');

    const b = await connect(code);
    // 흑이 한 수 둔다
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7', by: 'black', state: { board: [], turn: 'black' } }, seq: 1 }));
    await new Promise((r) => setTimeout(r, 50));

    // 백이 재접속하면 서버는 다음 차례(white)를 알려줘야 한다
    const bAgain = await connect(code, b.first.token);
    expect(bAgain.first.turn).toBe('white');
  });
});
