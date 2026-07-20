# 온라인 방 대전 — 클라이언트(오목) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오목 페이지에서 방을 만들고 코드·링크로 상대를 초대해 실제로 온라인 대국을 완주한다. 서버(계획서 2)는 이미 완성돼 있다.

**Architecture:** 공용 `multiplayer.js`가 방 생성·WebSocket·재연결·토큰을 전담하고, 게임별 어댑터가 상태 직렬화·복원·수 적용만 담당한다. 기존 `script.js`에는 훅 3곳만 추가한다. AI·2인 로컬 모드는 그대로 둔다.

**Tech Stack:** 바닐라 JS(모듈 아님, 전역 스크립트), WebSocket, localStorage

## Global Constraints

- 설계 문서 `docs/superpowers/specs/2026-07-20-multiplayer-rooms-design.md`를 따른다.
- 서버 프로토콜은 계획서 2 구현이 확정본이다. 메시지 타입: 수신 `joined`/`move`/`rejected`/`opponent`/`status`/`error`, 송신 `move`.
- 좌석 라벨은 `black`/`white`. 오목에서 `black`이 선공.
- 기존 게임 파일은 **추가만** 한다. AI 대전·2인 로컬 대전 동작이 바뀌면 실패로 본다.
- 저장소는 ES 모듈을 쓰지 않는다. 새 클라이언트 파일도 전역 스크립트(IIFE)로 작성한다.
- **커밋은 하되 푸시하지 않는다.** 브랜치 `feature/workers-migration`.
- 배포하지 않는다.

---

### Task 1: 오목 어댑터

**Files:**
- Create: `adapters/omok.js`
- Modify: `scripts/build-dist.mjs`

**Interfaces:**
- Produces: `window.OmokboardAdapters.omok` — 아래 6개 메서드를 가진 객체.
  - `serialize(game)` → `{ board, turn }`
  - `restore(game, state)` → 화면·내부 상태 복원
  - `applyMove(game, move)` → 상대 수 적용
  - `onLocalMove(game, cb)` → 내 수 발생 시 `cb({row, col, cell, state})` 호출되도록 등록
  - `setInputEnabled(game, on)` → 입력 잠금 토글
  - `serverChecks` → `['turn', 'emptyCell']`

- [ ] **Step 1: 어댑터 작성**

`adapters/omok.js`:

```js
// 오목 어댑터: 서버 프로토콜과 OmokGame 사이를 잇는다.
// 게임 규칙은 건드리지 않고 상태 직렬화/복원/수 적용만 담당한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.omok = {
    id: 'omok',
    serverChecks: ['turn', 'emptyCell'],

    serialize(game) {
      return { board: game.board, turn: game.currentTurn };
    },

    // 서버가 준 상태로 판을 다시 그린다. 승패 판정·소리 없이 DOM만 맞춘다.
    restore(game, state) {
      if (!state) return;
      game.board = state.board.map((row) => row.slice());
      game.currentTurn = state.turn;
      game.renderBoard();
      for (let r = 0; r < game.board.length; r++) {
        for (let c = 0; c < game.board[r].length; c++) {
          const color = game.board[r][c];
          if (!color) continue;
          const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
          if (!cell) continue;
          cell.classList.add('has-stone');
          const stone = document.createElement('div');
          stone.className = `stone ${color}`;
          cell.appendChild(stone);
        }
      }
      game.updateUI();
    },

    applyMove(game, move) {
      game.placeStone(move.row, move.col, { remote: true });
    },

    onLocalMove(game, cb) {
      game.onMoveApplied = (row, col, opts) => {
        if (opts && opts.remote) return; // 원격 수는 되쏘지 않는다
        cb({
          row,
          col,
          cell: `${row},${col}`,
          state: window.OmokboardAdapters.omok.serialize(game),
        });
      };
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
```

- [ ] **Step 2: 빌드 스크립트에 adapters 디렉터리 추가**

`scripts/build-dist.mjs`의 `COPY_DIRS`를 바꾼다.

```js
const COPY_DIRS = ['en', 'og', 'adapters'];
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `dist/ 생성 완료` 출력.

Run: `node -e "console.log(require('fs').existsSync('dist/adapters/omok.js'))"`
Expected: `true`

- [ ] **Step 4: 커밋**

```bash
git add adapters/omok.js scripts/build-dist.mjs
git commit -m "feat: 오목 어댑터(직렬화·복원·수 적용) + 빌드에 adapters 포함"
```

---

### Task 2: script.js 훅 3곳

**Files:**
- Modify: `script.js`

**Interfaces:**
- Produces: `game.onMoveApplied(row, col, opts)` 훅, `game.inputLocked` 플래그, `placeStone(row, col, opts)` 3번째 인자, `gameMode === 'online'` 지원.

- [ ] **Step 1: 클릭 입력 게이트 추가**

`bindEvents()`의 클릭 핸들러(현재 149~158행)에서 `if (cell) {` 바로 다음 줄에 추가한다.

```js
                if (this.inputLocked) return;
```

기존 AI 차례 무시 줄은 그대로 둔다.

- [ ] **Step 2: placeStone에 opts 인자와 훅 추가**

시그니처를 바꾼다.

```js
    placeStone(row, col, opts = {}) {
```

훅은 **승패 판정 직전**에 넣는다. 승리 수도 상대에게 전달돼야 하는데, 승리 시 `handleWin()` 후 `return` 하므로 그 뒤에 두면 마지막 수가 전송되지 않는다.

`cell.appendChild(stone);` 다음, `const winningCells = this.checkWin(row, col);` **앞**에 한 줄 넣는다.

```js
        if (this.onMoveApplied) this.onMoveApplied(row, col, opts);
```

결과적으로 이 순서가 된다.

```js
        cell.appendChild(stone);

        if (this.onMoveApplied) this.onMoveApplied(row, col, opts);

        const winningCells = this.checkWin(row, col);
```

- [ ] **Step 3: 온라인 모드에 AI가 끼어들지 않는지 확인**

`placeStone` 끝의 AI 예약은 `this.gameMode === 'ai'` 조건이라 온라인 모드(`'online'`)에서는 실행되지 않는다. **코드는 바꾸지 않고 확인만 한다.**

Run: `grep -n "gameMode === 'ai'" script.js`
Expected: 두 곳(클릭 무시, AI 예약)만 출력된다. 온라인 모드가 이 조건에 걸리지 않음을 확인한다.

- [ ] **Step 4: 훅이 정확히 한 번만 들어갔는지 확인**

Run: `grep -c "onMoveApplied" script.js`
Expected: `1`

- [ ] **Step 5: 기존 모드 회귀 확인**

```bash
npm run build
npx wrangler dev --port 8790
```

브라우저에서 `http://localhost:8790/omok` 을 연다.

- AI 대전(보통) 시작 → 돌을 두면 AI가 응수한다
- 2인 대전 시작 → 흑·백 번갈아 둘 수 있다
- 5목 완성 시 승리 모달이 뜬다

셋 다 정상이어야 한다. 확인 후 `wrangler dev` 종료.

- [ ] **Step 6: 커밋**

```bash
git add script.js
git commit -m "feat: OmokGame에 온라인 대전용 훅 추가(onMoveApplied·inputLocked·opts)"
```

---

### Task 3: multiplayer.js — 연결·재연결·디스패치

**Files:**
- Create: `multiplayer.js`

**Interfaces:**
- Produces: `window.Multiplayer.start({ gameId, game, adapter, ui })`.
  - `ui`는 콜백 묶음: `onStatus(status, info)`, `onCode(code, shareUrl)`, `onError(code)`.
  - 내부에서 방 생성 또는 `?room=` 입장을 자동 판단한다.

- [ ] **Step 1: 작성**

`multiplayer.js`:

```js
// 온라인 방 대전 클라이언트. 게임 로직은 어댑터에 위임한다.
(function () {
  const GRACE_MS = 120000;
  const BACKOFF = [1000, 2000, 4000, 8000, 15000];

  function tokenKey(code) {
    return `omokboard.room.${code}`;
  }

  window.Multiplayer = {
    start({ gameId, game, adapter, ui }) {
      const session = {
        gameId, game, adapter, ui,
        code: null, color: null, seq: 0,
        ws: null, attempt: 0, closedByUs: false, graceUntil: 0,
      };

      const params = new URLSearchParams(location.search);
      const joinCode = params.get('room');

      if (joinCode) {
        session.code = joinCode.toUpperCase();
        connect(session);
      } else {
        createRoom(session);
      }
      return session;
    },
  };

  async function createRoom(session) {
    const res = await fetch('/api/room', {
      method: 'POST',
      body: JSON.stringify({ gameId: session.gameId }),
    });
    if (!res.ok) return session.ui.onError('CREATE_FAILED');
    const data = await res.json();
    session.code = data.code;
    localStorage.setItem(tokenKey(data.code), data.token);
    session.ui.onCode(data.code, shareUrl(data.code));
    connect(session);
  }

  function shareUrl(code) {
    return `${location.origin}${location.pathname}?room=${code}`;
  }

  function connect(session) {
    const token = localStorage.getItem(tokenKey(session.code)) || '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/room/${session.code}${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(url);
    session.ws = ws;

    ws.addEventListener('open', () => {
      session.attempt = 0;
      session.ui.onStatus('connected');
    });

    ws.addEventListener('message', (e) => handle(session, JSON.parse(e.data)));

    ws.addEventListener('close', () => {
      if (session.closedByUs) return;
      scheduleReconnect(session);
    });
  }

  function scheduleReconnect(session) {
    if (!session.graceUntil) session.graceUntil = Date.now() + GRACE_MS;
    if (Date.now() > session.graceUntil) return session.ui.onStatus('finished', { reason: 'DISCONNECTED' });
    const wait = BACKOFF[Math.min(session.attempt, BACKOFF.length - 1)];
    session.attempt++;
    session.ui.onStatus('reconnecting', { wait });
    setTimeout(() => connect(session), wait);
  }

  function handle(session, msg) {
    const { game, adapter, ui } = session;

    switch (msg.type) {
      case 'joined':
        session.color = msg.color;
        session.seq = msg.seq;
        session.graceUntil = 0;
        if (msg.token) localStorage.setItem(tokenKey(session.code), msg.token);
        if (msg.state) adapter.restore(game, msg.state);
        bindLocalMoves(session);
        ui.onCode(session.code, shareUrl(session.code));
        ui.onStatus(msg.status, { color: msg.color });
        updateInput(session);
        break;

      case 'move':
        session.seq = msg.seq;
        // 내가 둔 수가 되돌아온 경우엔 이미 화면에 반영돼 있다.
        if (msg.move && msg.move.by !== session.color) {
          adapter.applyMove(game, msg.move);
        }
        updateInput(session);
        break;

      case 'rejected':
        // 서버가 권위. 받은 상태로 되돌린다.
        session.seq = msg.seq;
        adapter.restore(game, msg.state);
        updateInput(session);
        ui.onError(msg.reason);
        break;

      case 'opponent':
        ui.onStatus(msg.event === 'left' ? 'opponent_left' : 'opponent_back');
        break;

      case 'status':
        ui.onStatus(msg.status, msg);
        updateInput(session);
        break;

      case 'error':
        session.closedByUs = true;
        ui.onError(msg.code);
        break;
    }
  }

  function updateInput(session) {
    const myTurn = session.game.currentTurn === session.color;
    session.adapter.setInputEnabled(session.game, myTurn);
  }

  function bindLocalMoves(session) {
    session.adapter.onLocalMove(session.game, (move) => {
      move.by = session.color;
      session.seq += 1;
      session.ws.send(JSON.stringify({ type: 'move', move, seq: session.seq }));
      updateInput(session);
    });
  }
})();
```

- [ ] **Step 2: 커밋**

```bash
git add multiplayer.js
git commit -m "feat: multiplayer.js - 방 생성·입장·재연결 백오프·메시지 디스패치"
```

---

### Task 4: 오목 페이지 온라인 모드 UI

**Files:**
- Modify: `omok.html`

**Interfaces:**
- Consumes: `window.Multiplayer.start`, `window.OmokboardAdapters.omok`
- Produces: 모드 선택에 "온라인 대전" 버튼, 방 코드·공유 링크·상태 표시 패널.

- [ ] **Step 1: 스크립트 태그 추가**

`omok.html`에서 `<script src="script.js?v=2"></script>` **다음 줄**에 추가한다.

```html
    <script src="/adapters/omok.js?v=1"></script>
    <script src="/multiplayer.js?v=1"></script>
```

- [ ] **Step 2: 모드 선택에 온라인 버튼 추가**

`#mode-overlay` 안의 2인 대전 버튼(`onclick="window.omokGame.startGame('pvp')"`) **다음**에 추가한다.

```html
                    <button class="mode-btn" onclick="window.startOnlineOmok()">
                        <span class="ko-only">온라인 대전</span><span class="en-only" style="display:none;">Online Match</span>
                    </button>
```

- [ ] **Step 3: 방 패널 마크업 추가**

`</main>` 직전에 추가한다.

```html
    <div id="room-panel" class="hidden" style="max-width:520px;margin:1rem auto 0;padding:1rem 1.25rem;border:1px solid rgba(255,255,255,0.12);border-radius:0.75rem;background:rgba(255,255,255,0.04);">
        <div id="room-status" style="color:var(--text-muted);font-size:0.95rem;"></div>
        <div id="room-code-row" class="hidden" style="margin-top:0.6rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            <span style="font-size:0.85rem;color:var(--text-muted);">방 코드</span>
            <strong id="room-code" style="font-size:1.4rem;letter-spacing:0.15em;"></strong>
            <button id="room-copy" class="btn secondary" style="min-height:44px;padding:0 0.9rem;">링크 복사</button>
        </div>
        <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
            <input id="room-input" placeholder="코드 입력 (예: K7RM92)" maxlength="6"
                   style="flex:1;min-width:160px;min-height:44px;padding:0 0.75rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.25);color:var(--text-main);text-transform:uppercase;">
            <button id="room-join" class="btn primary" style="min-height:44px;">입장</button>
        </div>
    </div>
```

- [ ] **Step 4: 온라인 모드 진입 스크립트 추가**

`</body>` 직전에 추가한다.

```html
    <script>
    // 온라인 대전 진입점. 기존 AI·2인 모드는 건드리지 않는다.
    (function () {
      const panel = document.getElementById('room-panel');
      const statusEl = document.getElementById('room-status');
      const codeRow = document.getElementById('room-code-row');
      const codeEl = document.getElementById('room-code');

      const TEXT = {
        waiting: '상대를 기다리는 중입니다. 코드나 링크를 공유하세요.',
        playing: '대국 중입니다.',
        paused: '상대의 연결이 끊겼습니다. 잠시 기다립니다.',
        finished: '대국이 종료되었습니다.',
        connected: '서버에 연결되었습니다.',
        reconnecting: '연결이 끊겨 재접속 중입니다.',
        opponent_left: '상대의 연결이 끊겼습니다.',
        opponent_back: '상대가 돌아왔습니다.',
      };
      const ERR = {
        ROOM_FULL: '이미 두 명이 대전 중인 방입니다.',
        ROOM_NOT_FOUND: '존재하지 않는 방 코드입니다.',
        NOT_YOUR_TURN: '상대 차례입니다.',
        CELL_TAKEN: '이미 돌이 놓인 자리입니다.',
        SEQ_MISMATCH: '판을 서버 기준으로 맞췄습니다.',
        CREATE_FAILED: '방 생성에 실패했습니다.',
      };

      let shareLink = '';

      const ui = {
        onStatus(status, info) {
          statusEl.textContent = TEXT[status] || status;
          if (status === 'playing' && info && info.color) {
            statusEl.textContent += ` (내 돌: ${info.color === 'black' ? '흑' : '백'})`;
          }
        },
        onCode(code, url) {
          shareLink = url;
          codeEl.textContent = code;
          codeRow.classList.remove('hidden');
        },
        onError(code) {
          statusEl.textContent = ERR[code] || code;
        },
      };

      function begin() {
        panel.classList.remove('hidden');
        window.omokGame.startGame('online');
        window.omokGame.inputLocked = true;
        window.Multiplayer.start({
          gameId: 'omok',
          game: window.omokGame,
          adapter: window.OmokboardAdapters.omok,
          ui,
        });
      }

      window.startOnlineOmok = begin;

      document.getElementById('room-copy').addEventListener('click', () => {
        if (shareLink) navigator.clipboard.writeText(shareLink);
      });

      document.getElementById('room-join').addEventListener('click', () => {
        const code = document.getElementById('room-input').value.trim().toUpperCase();
        if (code.length !== 6) return ui.onError('ROOM_NOT_FOUND');
        location.search = `?room=${code}`;
      });

      // 링크로 들어온 경우 자동 입장
      if (new URLSearchParams(location.search).get('room')) begin();
    })();
    </script>
```

- [ ] **Step 5: 커밋**

```bash
git add omok.html
git commit -m "feat: 오목 온라인 대전 UI(방 코드·공유 링크·코드 입장·상태)"
```

---

### Task 5: 브라우저 E2E 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 서버 기동**

```bash
npm run build
npx wrangler dev --port 8790
```

- [ ] **Step 2: 방 생성**

브라우저 탭 A에서 `http://localhost:8790/omok` → "온라인 대전" 클릭.

Expected: 방 코드 6자가 표시되고 상태가 "상대를 기다리는 중입니다."

- [ ] **Step 3: 두 번째 참가자 입장**

탭 B에서 탭 A가 보여준 공유 링크(`http://localhost:8790/omok?room=<코드>`)를 연다.

Expected: 양쪽 상태가 "대국 중입니다."로 바뀌고, 각자 자기 돌 색이 표시된다.

- [ ] **Step 4: 수 교환**

탭 A(흑)에서 아무 칸이나 클릭한다.

Expected: 두 탭 모두에 검은 돌이 같은 위치에 나타난다. 이제 탭 A는 클릭해도 반응이 없고(내 차례 아님), 탭 B는 둘 수 있다.

- [ ] **Step 5: 턴 위반 차단 확인**

탭 A(현재 상대 차례)에서 콘솔을 열고 실행한다.

```js
window.omokGame.inputLocked = false;
document.querySelector('.cell[data-row="3"][data-col="3"]').click();
```

Expected: 서버가 거부해 상태 표시가 "상대 차례입니다."로 바뀌고, 판은 서버 기준으로 되돌아온다.

- [ ] **Step 6: 재접속 확인**

탭 B를 새로고침한다.

Expected: 같은 방에 자동 재입장하고, 지금까지 둔 돌이 그대로 복원된다. 탭 A에는 상대가 돌아왔다는 표시가 뜬다.

- [ ] **Step 7: 대국 완주**

5목이 완성될 때까지 번갈아 둔다.

Expected: 승리한 쪽 화면에 기존 승리 모달이 뜬다.

- [ ] **Step 8: 기존 모드 회귀 재확인**

`http://localhost:8790/omok` 을 새로 열어 AI 대전과 2인 대전을 각각 한 번씩 진행한다.

Expected: 온라인 기능 추가 전과 동일하게 동작한다.

- [ ] **Step 9: 전체 검증 + 커밋**

```bash
npm test
npm run smoke -- http://localhost:8790
git add -A
git commit -m "test: 오목 온라인 대전 E2E 검증 완료"
```

---

## 완료 기준

- 두 탭에서 방 코드/링크로 만나 오목 한 판을 완주한다
- 새로고침해도 판이 복원된다
- 턴 위반이 서버에서 거부되고 화면이 서버 기준으로 맞춰진다
- AI 대전·2인 로컬 대전이 이전과 동일하게 동작한다
- `npm test` 19개 통과, `npm run smoke` 통과
- 푸시·배포 없음

## 남은 작업 (다음 계획서)

- 나머지 5종 어댑터(사목·리버시·점잇기·체스·틱택토) — 스펙 5단계
- 항복·재대결(rematch) UI
- 배포 (AdSense 심사 통과 후)
