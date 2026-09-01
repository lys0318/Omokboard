import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

async function createRoom() {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST',
    body: JSON.stringify({ gameId: 'omok' }),
  });
  return res.json();
}

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

function nextMessage(ws) {
  return new Promise((resolve) => {
    ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
  });
}

describe('나가기', () => {
  it('한쪽이 나가면 남은 쪽에 waiting/OPPONENT_LEFT_ROOM이 오고 자리가 즉시 빈다', async () => {
    const { code, token } = await createRoom();
    const a = await connect(code, token); // black
    const b = await connect(code); // white

    const waitForB = nextMessage(b.ws);
    a.ws.send(JSON.stringify({ type: 'leave' }));
    const msg = await waitForB;

    expect(msg.type).toBe('status');
    expect(msg.status).toBe('waiting');
    expect(msg.reason).toBe('OPPONENT_LEFT_ROOM');
  });

  it('나간 자리에 새 플레이어가 같은 코드로 들어올 수 있다', async () => {
    const { code, token } = await createRoom();
    const a = await connect(code, token);
    await connect(code);

    a.ws.send(JSON.stringify({ type: 'leave' }));
    await new Promise((r) => setTimeout(r, 20));

    // 새 플레이어가 비어있는 black 자리로 들어온다
    const c = await connect(code);
    expect(c.first.type).toBe('joined');
    expect(c.first.color).toBe('black');
  });

  it('나가기 후 재접속을 시도하지 않는다(그레이스 상태로 안 빠짐)', async () => {
    const { code, token } = await createRoom();
    const a = await connect(code, token);
    await connect(code);

    a.ws.send(JSON.stringify({ type: 'leave' }));
    await new Promise((r) => setTimeout(r, 20));

    // 나간 색으로는 토큰이 더 이상 유효하지 않다 (자리 자체가 비었으므로 새 seat 배정)
    const rejoin = await connect(code, token);
    expect(rejoin.first.color).toBe('black'); // 빈 자리로 새로 배정된 것이지 paused 복귀가 아님
  });
});

describe('재대결', () => {
  it('한쪽만 요청하면 상대에게만 rematch_wait이 간다', async () => {
    const { code, token } = await createRoom();
    const a = await connect(code, token);
    const b = await connect(code);

    const waitForB = nextMessage(b.ws);
    a.ws.send(JSON.stringify({ type: 'rematch' }));
    const msg = await waitForB;

    expect(msg.type).toBe('rematch_wait');
    expect(msg.color).toBe('black');
  });

  it('둘 다 요청하면 양쪽에 rematch_start가 오고 판이 초기화된다', async () => {
    const { code, token } = await createRoom();
    const a = await connect(code, token);
    const b = await connect(code);

    // 판을 한 수 진행해 seq/occupied가 0이 아니게 만든다
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7', by: 'black', state: { board: [], turn: 'black' } }, seq: 1 }));
    await new Promise((r) => setTimeout(r, 20));

    // A가 먼저 요청 → B는 "상대가 원한다"는 rematch_wait을 정당하게 먼저 받는다
    const waitForB1 = nextMessage(b.ws);
    a.ws.send(JSON.stringify({ type: 'rematch' }));
    const msgB1 = await waitForB1;
    expect(msgB1.type).toBe('rematch_wait');
    expect(msgB1.color).toBe('black');

    // B도 요청 → 이제 양쪽 다 rematch_start를 받는다
    const waitForA = nextMessage(a.ws);
    const waitForB2 = nextMessage(b.ws);
    b.ws.send(JSON.stringify({ type: 'rematch' }));
    const [msgA, msgB2] = await Promise.all([waitForA, waitForB2]);
    expect(msgA.type).toBe('rematch_start');
    expect(msgB2.type).toBe('rematch_start');
    expect(msgA.turn).toBe('black');

    // 초기화됐으니 seq 1은 다시 유효해야 한다
    const waitMove = nextMessage(b.ws);
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7', by: 'black', state: { board: [], turn: 'black' } }, seq: 1 }));
    const moveMsg = await waitMove;
    expect(moveMsg.type).toBe('move');
  });
});
