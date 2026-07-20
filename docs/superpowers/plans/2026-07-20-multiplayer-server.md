# 온라인 방 대전 — 서버(Worker + Durable Object) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방 생성·입장·수 릴레이·재접속을 처리하는 Worker와 Durable Object를 만든다. 이 계획서 범위에는 UI가 없다. 검증은 전부 테스트로 한다.

**Architecture:** Worker가 `/api/room` 요청만 처리하고 나머지는 정적 자산으로 넘긴다. 방 코드 하나가 `RoomDO` 인스턴스 하나에 대응한다(`idFromName`). RoomDO가 상태 저장·경량 검증·WebSocket 관리·알람을 전담한다.

**Tech Stack:** Cloudflare Workers, Durable Objects (SQLite 백엔드), WebSocket Hibernation API, Vitest + `@cloudflare/vitest-pool-workers`

## Global Constraints

- 설계 문서 `docs/superpowers/specs/2026-07-20-multiplayer-rooms-design.md`를 따른다. 충돌하면 설계 문서가 우선이다.
- 방 코드: 6자리, `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (혼동 문자 `0 O 1 I L` 제외).
- 좌석 라벨은 `'black' | 'white'` 두 개뿐이다. `black`이 선공, 방장이 `black`.
- 재접속 유예 120초, 방 만료 1800초(마지막 활동 기준).
- 경량 검증만 한다: 턴 순서, 칸 점유(선언한 게임만), 방 인원. 게임 규칙은 검증하지 않는다.
- **알람은 DO당 하나뿐이다.** 유예 마감과 방 만료 중 이른 시각으로 설정하고 발화 시 이유를 판단한다.
- DO는 `idFromName`으로 항상 생성되므로 `initialized` 플래그로 "없는 방"을 구분한다.
- 기존 게임 HTML/CSS/JS는 이 계획서에서 수정하지 않는다. 클라이언트 작업은 다음 계획서다.
- **커밋은 하되 푸시하지 않는다.** 브랜치는 `feature/workers-migration`.
- 배포하지 않는다.

---

### Task 1: 테스트 하네스 + 방 코드 생성기

**Files:**
- Create: `worker/code.js`
- Create: `test/code.spec.js`
- Create: `vitest.config.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `generateCode(rand?)` — 6자 방 코드 문자열 반환. `rand`는 테스트용 난수 함수(기본 `Math.random`). `ALPHABET` 상수도 export.

- [ ] **Step 1: 테스트 도구 설치**

```bash
npm install --save-dev vitest@^4.1.0 @cloudflare/vitest-pool-workers
```

- [ ] **Step 2: `vitest.config.mjs` 작성**

`@cloudflare/vitest-pool-workers` 0.18 + vitest 4에서는 `./config` 서브패스와 `defineWorkersConfig`가 없어졌다. pool 옵션이 아니라 **Vite 플러그인**으로 붙인다. 또 `package.json`이 `"type": "commonjs"`이므로 확장자는 `.mjs`여야 한다.

```js
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
});
```

- [ ] **Step 3: package.json에 test 스크립트 추가**

`"scripts"`에 추가한다.

```json
"test": "vitest run"
```

- [ ] **Step 4: 실패하는 테스트 작성**

`test/code.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateCode, ALPHABET } from '../worker/code.js';

describe('generateCode', () => {
  it('6자를 반환한다', () => {
    expect(generateCode()).toHaveLength(6);
  });

  it('혼동 문자를 쓰지 않는다', () => {
    for (const ch of '0O1IL') expect(ALPHABET).not.toContain(ch);
  });

  it('허용 알파벳만 사용한다', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of generateCode()) expect(ALPHABET).toContain(ch);
    }
  });

  it('난수 함수를 주입하면 결정적으로 동작한다', () => {
    const rand = () => 0;                    // 항상 첫 글자
    expect(generateCode(rand)).toBe(ALPHABET[0].repeat(6));
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `npm test -- test/code.spec.js`
Expected: FAIL — `worker/code.js` 를 찾을 수 없다는 오류.

- [ ] **Step 6: 최소 구현**

`worker/code.js`:

```js
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(rand = Math.random) {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test -- test/code.spec.js`
Expected: PASS, 4개 테스트 전부 통과.

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json vitest.config.mjs worker/code.js test/code.spec.js
git commit -m "test: vitest 하네스 + 방 코드 생성기"
```

---

### Task 2: wrangler 설정 + Worker 라우팅 뼈대

**Files:**
- Modify: `wrangler.jsonc`
- Create: `worker/index.js`
- Create: `worker/room.js` (뼈대만)
- Create: `test/routing.spec.js`

**Interfaces:**
- Consumes: Task 1의 `generateCode`
- Produces: `POST /api/room` → `{ code, token, color }` 201. 그 외 `/api/*`는 404. 정적 자산 경로는 Worker가 건드리지 않는다. `RoomDO` 클래스 export.

- [ ] **Step 1: wrangler.jsonc에 main·DO·migration 추가**

```jsonc
{
  "name": "omokboard",
  "compatibility_date": "2026-07-20",
  "main": "./worker/index.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  },
  "durable_objects": {
    "bindings": [{ "name": "ROOM", "class_name": "RoomDO" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["RoomDO"] }
  ]
}
```

`new_sqlite_classes`를 쓴다. 무료 플랜에서는 SQLite 백엔드만 가능하다.

- [ ] **Step 2: 실패하는 라우팅 테스트 작성**

`test/routing.spec.js`:

```js
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('라우팅', () => {
  it('POST /api/room 은 코드와 토큰을 준다', async () => {
    const res = await SELF.fetch('https://example.com/api/room', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'omok' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toHaveLength(6);
    expect(typeof body.token).toBe('string');
    expect(body.color).toBe('black');
  });

  it('알 수 없는 /api 경로는 404', async () => {
    const res = await SELF.fetch('https://example.com/api/nope');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- test/routing.spec.js`
Expected: FAIL — `worker/index.js` 없음.

- [ ] **Step 4: RoomDO 뼈대 작성**

`worker/room.js`:

```js
export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create') return this.create(request);
    return new Response('not found', { status: 404 });
  }

  // 방을 처음 만든다. 이미 초기화됐으면 409를 준다(코드 충돌).
  async create(request) {
    const { gameId } = await request.json();
    if (await this.ctx.storage.get('initialized')) {
      return new Response(JSON.stringify({ error: 'CODE_TAKEN' }), { status: 409 });
    }
    const token = crypto.randomUUID();
    await this.ctx.storage.put({
      initialized: true,
      gameId,
      status: 'waiting',
      turn: 'black',
      seq: 0,
      state: null,
      players: { black: { token, connected: false }, white: null },
      lastActivityAt: Date.now(),
    });
    return new Response(JSON.stringify({ token, color: 'black' }), { status: 201 });
  }
}
```

- [ ] **Step 5: Worker 엔트리 작성**

`worker/index.js`:

```js
import { generateCode } from './code.js';
export { RoomDO } from './room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /api 외의 경로는 정적 자산이 처리한다.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (url.pathname === '/api/room' && request.method === 'POST') {
      return createRoom(request, env);
    }
    return new Response('not found', { status: 404 });
  },
};

// 코드가 겹치면 다른 코드로 재시도한다.
async function createRoom(request, env) {
  const body = await request.text();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    const res = await stub.fetch('https://do/create', { method: 'POST', body });
    if (res.status === 201) {
      const data = await res.json();
      return Response.json({ code, ...data }, { status: 201 });
    }
  }
  return new Response(JSON.stringify({ error: 'NO_CODE_AVAILABLE' }), { status: 503 });
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -- test/routing.spec.js`
Expected: PASS, 2개 통과.

- [ ] **Step 7: 정적 자산이 여전히 뜨는지 확인**

```bash
npm run build
npx wrangler dev --port 8790
```

다른 터미널에서: `npm run smoke -- http://localhost:8790`
Expected: `전부 통과`. Worker가 붙었어도 정적 사이트는 그대로여야 한다.

확인 후 `wrangler dev`를 종료한다.

- [ ] **Step 8: 커밋**

```bash
git add wrangler.jsonc worker/index.js worker/room.js test/routing.spec.js
git commit -m "feat: Worker 라우팅 + RoomDO 뼈대, 방 생성 API"
```

---

### Task 3: 입장·토큰·인원 제한 (WebSocket)

**Files:**
- Modify: `worker/index.js`
- Modify: `worker/room.js`
- Create: `test/join.spec.js`

**Interfaces:**
- Produces: `GET /api/room/:code` (WebSocket upgrade). 서버가 보내는 첫 메시지는 `{type:'joined', color, status, state, seq}`. 정원 초과 시 `{type:'error', code:'ROOM_FULL'}` 후 종료. 초기화 안 된 방은 `{type:'error', code:'ROOM_NOT_FOUND'}` 후 종료.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/join.spec.js`:

```js
import { env, SELF } from 'cloudflare:test';
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/join.spec.js`
Expected: FAIL — WebSocket 경로가 없어 응답에 `webSocket`이 없다.

- [ ] **Step 3: Worker에 WS 라우트 추가**

`worker/index.js`의 라우팅 분기에 아래를 `/api/room` 분기 다음에 넣는다.

```js
    const m = url.pathname.match(/^\/api\/room\/([A-Z0-9]{6})$/);
    if (m) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      return stub.fetch(request);
    }
```

- [ ] **Step 4: RoomDO에 입장 처리 구현**

`worker/room.js`의 `fetch`를 아래로 바꾸고 메서드를 추가한다.

```js
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create') return this.create(request);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);            // Hibernation API
      await this.onJoin(server, url.searchParams.get('token'));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  send(ws, obj) {
    ws.send(JSON.stringify(obj));
  }

  async onJoin(ws, token) {
    const room = await this.ctx.storage.get([
      'initialized', 'status', 'turn', 'seq', 'state', 'players',
    ]);
    if (!room.get('initialized')) {
      this.send(ws, { type: 'error', code: 'ROOM_NOT_FOUND' });
      ws.close(1008, 'ROOM_NOT_FOUND');
      await this.ctx.storage.deleteAll();          // 오타 코드로 생긴 빈 방 정리
      return;
    }

    const players = room.get('players');
    let color = null;

    // 1) 토큰이 맞으면 원래 자리 복귀
    for (const seat of ['black', 'white']) {
      if (players[seat] && token && players[seat].token === token) color = seat;
    }
    // 2) 아니면 빈 자리
    if (!color) {
      if (!players.black) color = 'black';
      else if (!players.white) color = 'white';
    }
    if (!color) {
      this.send(ws, { type: 'error', code: 'ROOM_FULL' });
      ws.close(1008, 'ROOM_FULL');
      return;
    }

    const seatToken = players[color]?.token ?? crypto.randomUUID();
    players[color] = { token: seatToken, connected: true };
    ws.serializeAttachment({ color });

    const status = players.black && players.white ? 'playing' : 'waiting';
    await this.ctx.storage.put({ players, status, lastActivityAt: Date.now() });

    this.send(ws, {
      type: 'joined',
      color,
      token: seatToken,
      status,
      state: room.get('state'),
      seq: room.get('seq'),
    });
  }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- test/join.spec.js`
Expected: PASS, 4개 통과.

- [ ] **Step 6: 커밋**

```bash
git add worker/index.js worker/room.js test/join.spec.js
git commit -m "feat: WebSocket 입장, 토큰 좌석 복귀, 정원·미존재 방 처리"
```

---

### Task 4: 수 릴레이 + 경량 검증 + seq

**Files:**
- Modify: `worker/room.js`
- Create: `test/move.spec.js`

**Interfaces:**
- Consumes: Task 3의 `joined` 메시지(`seq` 포함)
- Produces: 클라이언트 `{type:'move', move, seq}` 처리. 성공 시 두 소켓 모두에 `{type:'move', move, seq, turn}` 브로드캐스트. 실패 시 보낸 쪽에만 `{type:'rejected', reason, state, seq}`.
- `move.cell` 이 있으면 칸 점유 검증에 쓴다. `move.state` 는 어댑터가 만든 최신 상태이며 DO는 해석하지 않고 그대로 저장한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/move.spec.js`:

```js
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

async function setup() {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST', body: JSON.stringify({ gameId: 'omok' }),
  });
  const { code, token } = await res.json();
  const a = await connect(code, token);
  const b = await connect(code);
  return { code, a, b };
}

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
    if (waiters.length) waiters.shift()(msg); else queue.push(msg);
  });
  const next = () => queue.length
    ? Promise.resolve(queue.shift())
    : new Promise((r) => waiters.push(r));
  await next();                       // joined 소비
  return { ws, next };
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

  it('남의 차례에 두면 rejected', async () => {
    const { a, b } = await setup();
    b.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7' }, seq: 1 }));
    const msg = await b.next();
    expect(msg.type).toBe('rejected');
    expect(msg.reason).toBe('NOT_YOUR_TURN');
  });

  it('이미 찬 칸이면 rejected', async () => {
    const { a, b } = await setup();
    a.ws.send(JSON.stringify({ type: 'move', move: { cell: '7,7' }, seq: 1 }));
    await a.next(); await b.next();
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/move.spec.js`
Expected: FAIL — 메시지 핸들러가 없어 응답이 오지 않고 타임아웃.

- [ ] **Step 3: 메시지 핸들러 구현**

`worker/room.js`의 `RoomDO` 클래스에 추가한다.

```js
  // Hibernation API: 소켓이 깨어나면 런타임이 이 메서드를 부른다.
  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'move') return this.onMove(ws, msg);
  }

  broadcast(obj) {
    for (const s of this.ctx.getWebSockets()) this.send(s, obj);
  }

  async onMove(ws, msg) {
    const { color } = ws.deserializeAttachment() ?? {};
    const room = await this.ctx.storage.get(['status', 'turn', 'seq', 'state', 'occupied']);
    const seq = room.get('seq') ?? 0;
    const turn = room.get('turn');
    const occupied = new Set(room.get('occupied') ?? []);

    const reject = (reason) => this.send(ws, {
      type: 'rejected', reason, state: room.get('state'), seq,
    });

    if (msg.seq !== seq + 1) return reject('SEQ_MISMATCH');
    if (color !== turn) return reject('NOT_YOUR_TURN');
    if (msg.move?.cell && occupied.has(msg.move.cell)) return reject('CELL_TAKEN');

    if (msg.move?.cell) occupied.add(msg.move.cell);
    const nextTurn = turn === 'black' ? 'white' : 'black';
    const nextSeq = seq + 1;

    await this.ctx.storage.put({
      seq: nextSeq,
      turn: nextTurn,
      occupied: [...occupied],
      state: msg.move?.state ?? room.get('state'),
      lastActivityAt: Date.now(),
    });

    this.broadcast({ type: 'move', move: msg.move, seq: nextSeq, turn: nextTurn });
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- test/move.spec.js`
Expected: PASS, 4개 통과.

- [ ] **Step 5: 전체 테스트 확인**

Run: `npm test`
Expected: 모든 spec 통과.

- [ ] **Step 6: 커밋**

```bash
git add worker/room.js test/move.spec.js
git commit -m "feat: 수 릴레이 + 경량 검증(턴·칸·seq) + 재동기화 응답"
```

---

### Task 5: 끊김·재접속·알람

**Files:**
- Modify: `worker/room.js`
- Create: `test/alarm.spec.js`

**Interfaces:**
- Produces: 소켓이 닫히면 `status='paused'`, 상대에게 `{type:'opponent', event:'left'}` + `{type:'status', status:'paused', endsAt}`. 유예 안에 토큰 재접속하면 `playing` 복귀 + `{type:'opponent', event:'reconnected'}`. 유예 초과 시 `status='finished'`, `{type:'status', status:'finished', reason:'OPPONENT_LEFT'}`.
- 알람은 하나만 설정한다: `min(graceDeadline ?? ∞, roomExpiresAt)`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/alarm.spec.js`:

```js
import { SELF, runInDurableObject, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

// 알람 시각 계산만 단위로 검증한다. 시간 경과는 스토리지를 직접 조작해 흉내낸다.
describe('알람 단일 슬롯', () => {
  it('유예가 만료보다 이르면 유예 시각으로 잡는다', async () => {
    const id = env.ROOM.idFromName('ALARM1');
    const stub = env.ROOM.get(id);
    await runInDurableObject(stub, async (instance) => {
      const now = 1_000_000;
      instance.nextAlarmAt({ graceDeadline: now + 1000, roomExpiresAt: now + 99_000 });
      expect(instance.nextAlarmAt({ graceDeadline: now + 1000, roomExpiresAt: now + 99_000 }))
        .toBe(now + 1000);
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
        initialized: true, status: 'paused',
        graceDeadline: Date.now() - 1, roomExpiresAt: Date.now() + 100000,
        players: { black: { token: 't', connected: false }, white: { token: 'u', connected: true } },
      });
      await instance.alarm();
      expect(await state.storage.get('status')).toBe('finished');
    });
  });

  it('만료 시각이 지나면 방을 정리한다', async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName('ALARM4'));
    await runInDurableObject(stub, async (instance, state) => {
      await state.storage.put({
        initialized: true, status: 'waiting',
        graceDeadline: null, roomExpiresAt: Date.now() - 1,
        players: { black: { token: 't', connected: false }, white: null },
      });
      await instance.alarm();
      expect(await state.storage.get('initialized')).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/alarm.spec.js`
Expected: FAIL — `nextAlarmAt`, `alarm` 이 없다는 오류.

- [ ] **Step 3: 상수와 알람 로직 구현**

`worker/room.js` 파일 맨 위에 상수를 추가한다.

```js
const GRACE_MS = 120_000;     // 재접속 유예 2분
const ROOM_TTL_MS = 1_800_000; // 방 유지 30분
```

`RoomDO` 클래스에 아래 메서드를 추가한다.

```js
  // 알람은 DO당 하나뿐이다. 유예와 만료 중 이른 시각을 쓴다.
  nextAlarmAt({ graceDeadline, roomExpiresAt }) {
    return Math.min(graceDeadline ?? Infinity, roomExpiresAt);
  }

  async rescheduleAlarm() {
    const r = await this.ctx.storage.get(['graceDeadline', 'roomExpiresAt']);
    const at = this.nextAlarmAt({
      graceDeadline: r.get('graceDeadline') ?? null,
      roomExpiresAt: r.get('roomExpiresAt') ?? Date.now() + ROOM_TTL_MS,
    });
    await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const r = await this.ctx.storage.get(['status', 'graceDeadline', 'roomExpiresAt']);
    const now = Date.now();
    const grace = r.get('graceDeadline');

    if (r.get('status') === 'paused' && grace != null && now >= grace) {
      await this.ctx.storage.put({ status: 'finished', graceDeadline: null });
      this.broadcast({ type: 'status', status: 'finished', reason: 'OPPONENT_LEFT' });
      await this.rescheduleAlarm();
      return;
    }
    if (now >= (r.get('roomExpiresAt') ?? 0)) {
      this.broadcast({ type: 'status', status: 'finished', reason: 'ROOM_EXPIRED' });
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.rescheduleAlarm();
  }
```

- [ ] **Step 4: 끊김·재접속 처리 구현**

`RoomDO`에 추가한다.

```js
  async webSocketClose(ws) {
    const { color } = ws.deserializeAttachment() ?? {};
    if (!color) return;
    const players = await this.ctx.storage.get('players');
    if (!players?.[color]) return;
    players[color].connected = false;

    const graceDeadline = Date.now() + GRACE_MS;
    await this.ctx.storage.put({ players, status: 'paused', graceDeadline });
    await this.rescheduleAlarm();

    this.broadcast({ type: 'opponent', event: 'left' });
    this.broadcast({ type: 'status', status: 'paused', endsAt: graceDeadline });
  }
```

`onJoin`에서 좌석을 확정한 직후(`await this.ctx.storage.put({ players, status, ... })` 줄) 아래로 교체한다.

```js
    const reconnected = status === 'playing' && (await this.ctx.storage.get('status')) === 'paused';
    await this.ctx.storage.put({
      players, status,
      graceDeadline: null,
      roomExpiresAt: Date.now() + ROOM_TTL_MS,
      lastActivityAt: Date.now(),
    });
    await this.rescheduleAlarm();
    if (reconnected) this.broadcast({ type: 'opponent', event: 'reconnected' });
```

- [ ] **Step 5: 생성 시점에도 만료 알람을 건다**

Task 2의 `create()`는 `roomExpiresAt`을 넣지 않아, **아무도 입장하지 않은 방이 영영 정리되지 않는다.** `create()` 안의 `storage.put({...})` 호출에 `roomExpiresAt`을 추가하고 그 뒤에 알람을 건다.

```js
    await this.ctx.storage.put({
      initialized: true,
      gameId,
      status: 'waiting',
      turn: 'black',
      seq: 0,
      state: null,
      players: { black: { token, connected: false }, white: null },
      lastActivityAt: Date.now(),
      roomExpiresAt: Date.now() + ROOM_TTL_MS,
      graceDeadline: null,
    });
    await this.rescheduleAlarm();
```

- [ ] **Step 6: 방치된 방이 정리되는지 확인하는 테스트 추가**

`test/alarm.spec.js`의 `describe` 블록 안에 추가한다.

```js
  it('생성 후 아무도 입장하지 않은 방도 만료 알람이 걸린다', async () => {
    const res = await SELF.fetch('https://example.com/api/room', {
      method: 'POST', body: JSON.stringify({ gameId: 'omok' }),
    });
    const { code } = await res.json();
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
  });
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test -- test/alarm.spec.js`
Expected: PASS, 5개 통과.

- [ ] **Step 8: 전체 테스트 + 정적 사이트 회귀 확인**

```bash
npm test
npm run build
npx wrangler dev --port 8790
```

다른 터미널: `npm run smoke -- http://localhost:8790`
Expected: 테스트 전부 통과, 스모크도 `전부 통과`.

- [ ] **Step 9: 커밋**

```bash
git add worker/room.js test/alarm.spec.js
git commit -m "feat: 끊김 유예·재접속 복귀·단일 알람 슬롯(유예/만료 분기)"
```

---

## 완료 기준

- `npm test` 전부 통과 (code / routing / join / move / alarm)
- `npm run smoke` 통과 — Worker가 붙은 뒤에도 정적 사이트 무영향
- 기존 게임 HTML/CSS/JS 무수정 (`git diff --name-only` 로 확인)
- 푸시·배포 없음

## 다음 계획서

`2026-07-20-multiplayer-client.md` — `multiplayer.js`(WS·재연결 백오프·토큰 저장), 오목 어댑터, 방 만들기/코드 입력/공유 링크 UI, `script.js` 훅 추가. 브라우저 E2E로 검증한다.
