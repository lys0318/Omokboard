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

// accept 시점부터 모든 메시지를 버퍼에 쌓아두는 접속 — 동시 접속 테스트처럼
// "이미 도착해 있었을 수도 있는" 두 번째 메시지를 놓치지 않고 확인해야 할 때 쓴다.
function connectBuffered(code, token) {
  const qs = token ? `?token=${token}` : '';
  return SELF.fetch(`https://example.com/api/room/${code}${qs}`, {
    headers: { Upgrade: 'websocket' },
  }).then((res) => {
    const ws = res.webSocket;
    const buffer = [];
    ws.addEventListener('message', (e) => { buffer.push(JSON.parse(e.data)); });
    ws.accept();
    return { ws, buffer };
  });
}

function waitForBuffered(conn, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = conn.buffer.find(predicate);
      if (found) return resolve(found);
      if (Date.now() > deadline) return reject(new Error('timeout waiting for message'));
      setTimeout(check, 10);
    };
    const deadline = Date.now() + timeoutMs;
    check();
  });
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

describe('동시 접속', () => {
  it('두 사람이 정말 동시에 접속해도(순서 대기 없이) 둘 다 playing 신호를 받는다', async () => {
    // 부하 테스트로 재현된 회귀 케이스: 흑/백 접속을 순서대로 기다리지 않고
    // 동시에 쏘면(공유 링크를 받은 두 사람이 거의 같은 순간 들어오는 상황과
    // 동일) onJoin의 읽기→쓰기 사이에 서로 끼어들어 한쪽의 좌석 배정이
    // 유실될 수 있었다(blockConcurrencyWhile로 수정됨).
    const { code, token } = await createRoom();

    const [black, white] = await Promise.all([connectBuffered(code, token), connectBuffered(code)]);

    const blackJoined = await waitForBuffered(black, (m) => m.type === 'joined');
    const whiteJoined = await waitForBuffered(white, (m) => m.type === 'joined');
    expect(blackJoined.color).toBe('black');
    expect(whiteJoined.color).toBe('white');

    // 접속 순서에 따라 "playing" 신호는 자기 자신의 joined 메시지로 오거나
    // (나중에 합류한 쪽) 이미 있던 소켓에 대한 status 브로드캐스트로 온다
    // (먼저 합류한 쪽). 버퍼를 쓰므로 그 메시지가 이미 도착해 있었어도 놓치지 않는다.
    async function sawPlaying(conn, joined) {
      if (joined.status === 'playing') return true;
      const msg = await waitForBuffered(conn, (m) => m.type === 'status' && m.status === 'playing');
      return !!msg;
    }

    expect(await sawPlaying(black, blackJoined)).toBe(true);
    expect(await sawPlaying(white, whiteJoined)).toBe(true);
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
