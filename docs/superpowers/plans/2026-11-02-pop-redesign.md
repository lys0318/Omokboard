# 디자인 개편(놀이판 팝) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈과 게임 페이지 공통 틀을 "놀이판 팝"(굵은 테두리·각진 그림자·눌리는 버튼·분류 색) 디자인으로 바꾸고, 차례 튐·승리 색종이·숫자 세기 연출을 붙인다.

**Architecture:** 공용 `style.css`를 새 토큰(색·글꼴·테두리·그림자·곡선)과 부품 규칙으로 다시 쓰고, 게임 페이지는 `<body data-cat>`으로 분류 색을 받는다. 연출은 게임 코드를 고치지 않는 공용 스크립트 `fx.js`가 DOM 변화를 감지해 붙인다. 정적 검사 `scripts/design-check.mjs`와 순수 함수 검사 `scripts/fx-check.mjs`가 회귀를 막고, 나머지는 Playwright로 확인한다.

**Tech Stack:** 정적 HTML/CSS/바닐라 JS, Node(검사 스크립트, `node:vm`), Playwright MCP(브라우저 확인), `npm run dev`(wrangler, 포트 8787), `node build-en.js`(영어판 생성)

**Spec:** `docs/superpowers/specs/2026-11-02-pop-redesign-design.md`

## Global Constraints

- 색: 바탕 `#191310`, 카드 `#2a201a`, 카드 2 `#352820`, 글자 `#f6efe3`, 흐린 글자 `#b8a893`, 먹 `#000`, 빨강 `#d63526`, 파랑 `#2f6fe5`, 노랑 `#ffcf3f`, 노랑 위 글자 `#1a1208`
- 분류 색 위 글자: 빨강·파랑 `#fff`, 노랑 `#1a1208`. 투명도로 흐리게 하지 않는다. 분류 색을 글자 뒤에 깔지 않는다
- 글자 대비 4.5:1 이상(WCAG AA)
- 제목 글꼴 Black Han Sans(Google Fonts), 본문 Pretendard Variable(jsDelivr `orioncactus/pretendard@v1.3.9` dynamic-subset). Outfit 제거
- 움직이는 속성은 `transform`, `opacity`만. 누름 0.08s, 올림 0.15s, 나타남 0.35~0.45s `cubic-bezier(.3,1.5,.5,1)`, 사라짐 0.15s
- `prefers-reduced-motion: reduce`이면 움직임 없음(색종이 없음, 숫자 즉시 최종값)
- 게임판 그림(돌·말·딱지·캔버스 내용)과 게임 로직은 바꾸지 않는다
- 본문 글자는 바뀌지 않으므로 `page-dates.json`의 modified가 바뀌면 안 된다
- 줄바꿈: 파일 편집은 Edit 도구나 node로(파이썬 텍스트 모드 금지, 외톨이 CR 금지)
- 한국어 원본(`*.html`)만 고치고 영어판은 `node build-en.js`로 다시 만든다
- 커밋은 로컬만. 푸시(=배포)는 사용자 확인 후

## Review Focus

1. 노랑 분류 페이지(스도쿠 등)에서 밝은 글자가 노랑 위에 놓이는 곳(메뉴 현재 게임 알약, 선택된 모드 버튼, `--accent-blue` 배경) → 어두운 글자여야 한다. Task 2·3의 검사에 포함
2. 결과 창 판정 오작동: 방 창(`#room-panel`)·모드 창에 색종이, 패배·무승부·"펑!"·"게임 오버"에 색종이 → Task 4의 `isWin` 표 전부와 브라우저 확인
3. 숫자 세기가 게임이 나중에 바꾼 문장을 덮어쓰는 것(숫자야구·온라인 결과) → Task 4에서 외부 변경 시 세기 중단 확인
4. 글꼴 서버가 막히거나 느릴 때 글자가 안 보이는 것 → 대체 글꼴 목록 필수, `font-display: swap`. Task 1 검사에 포함
5. 360px에서 각진 그림자·기울인 스티커가 가로 스크롤을 만드는 것 → Task 3·5에서 `scrollWidth` 확인

---

### Task 1: 토큰·글꼴 교체와 정적 검사

**Files:**
- Create: `scripts/design-check.mjs`
- Modify: `style.css:1-50`(`:root`, `body`), `style.css`의 `font-family: 'Outfit'` 3곳(42, 441, 568행 부근)
- Modify: 36개 KO HTML의 `<head>` 글꼴 링크와 `style.css?v=15`
- Modify: `dots.js:579`, `yut.js:640,661,701`(캔버스 글꼴), `index.html:561`(인라인 Outfit)

**Interfaces:**
- Produces(CSS 변수, 이후 모든 Task가 사용):
  - 기존 이름 유지: `--bg-dark: #191310`, `--bg-darker: #100c0a`, `--surface: #2a201a`, `--text-main: #f6efe3`, `--text-muted: #b8a893`, `--accent: #d63526`, `--accent-hover: #b82c1f`, `--accent-soft: #ffcf3f`, `--accent-blue: #ffcf3f`, `--accent-blue-hover: #f0bc1f`(게임판 변수 `--board-*`, `--stone-*`, `--grid-line`, `--board-size`, `--cell-size`는 그대로)
  - 새 이름: `--surface-2: #352820`, `--ink: #000`, `--pop-red: #d63526`, `--pop-blue: #2f6fe5`, `--pop-yellow: #ffcf3f`, `--on-yellow: #1a1208`, `--cat: var(--pop-red)`, `--cat-ink: #fff`, `--line: 2.5px solid var(--ink)`, `--drop: 4px 4px 0 var(--ink)`, `--ease-pop: cubic-bezier(.3,1.5,.5,1)`
  - `--font-display: 'Black Han Sans', 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
  - `--font-body: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
  - `body[data-cat="brain"] { --cat: var(--pop-blue); }`, `body[data-cat="solo"] { --cat: var(--pop-yellow); --cat-ink: var(--on-yellow); }`
- Produces: `node scripts/design-check.mjs` — 실패 항목을 한 줄씩 출력하고 실패가 있으면 exit 1, 없으면 `OK`. Task 2·4가 검사 항목을 추가한다(`check(name, ok, detail)` 함수와 `pages`(KO HTML 목록), `GAMES`(아래 표의 14개) 상수를 export 없이 파일 안에서 공유)

- [ ] **Step 1: 기준 측정** — 바꾸기 전 `npm run dev`로 띄우고 Playwright로 `/`와 `/omok`을 열어 `performance.getEntriesByType('resource').filter(r => /\.woff2|fonts\.g|jsdelivr/.test(r.name)).reduce((s, r) => s + r.transferSize, 0)`을 기록(스크래치패드 `font-baseline.txt`). Task 6에서 비교한다

- [ ] **Step 2: 실패하는 검사 작성** — `scripts/design-check.mjs`에 다음 검사:
  - 루트의 KO HTML(`en/`, `dist/` 제외) 36개 모두: `Outfit` 문자열 없음, `family=Black+Han+Sans` 링크 있음, `pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css` 링크 있음, `rel="preconnect" href="https://cdn.jsdelivr.net"` 있음, `style.css?v=16`
  - `style.css`, `dots.js`, `yut.js`에 `Outfit` 없음
  - `style.css`의 `:root`에서 위 토큰 값을 읽어 대비 계산(WCAG 상대 휘도): (`--text-main`,`--bg-dark`), (`--text-main`,`--surface`), (`--text-muted`,`--surface`), (`--text-muted`,`--bg-dark`), (`#fff`,`--pop-red`), (`#fff`,`--pop-blue`), (`--on-yellow`,`--pop-yellow`), (`--accent-blue`,`--bg-dark`), (`--on-yellow`,`--accent-blue-hover`), (`#fff`,`--accent-hover`) 모두 ≥ 4.5
  - `--font-display`, `--font-body` 둘 다 `'Malgun Gothic'`과 `sans-serif`를 포함(대체 글꼴)

- [ ] **Step 3: 실패 확인** — Run: `node scripts/design-check.mjs` / Expected: Outfit·링크·v=16·토큰 항목에서 FAIL, exit 1

- [ ] **Step 4: 구현**
  - `style.css` `:root`를 Interfaces의 값으로, `body`의 `font-family: var(--font-body)`, 나머지 Outfit 2곳은 `inherit`
  - 36개 HTML: 기존 세 줄(preconnect 2 + Outfit 링크)을 다음 다섯 줄로 교체(node 스크립트로, 줄바꿈은 파일의 것을 따름), `style.css?v=15` → `?v=16`
    ```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
    ```
  - `dots.js`, `yut.js` 캔버스: `Outfit, sans-serif` → `'Pretendard Variable', sans-serif`. `index.html:561` 인라인도 같은 교체

- [ ] **Step 5: 통과 확인** — Run: `node scripts/design-check.mjs` / Expected: `OK`

- [ ] **Step 6: 커밋** — `git add -A && git commit -m "style: 새 색 토큰과 한글 글꼴(Black Han Sans, Pretendard)로 교체"`

### Task 2: 분류 표시와 노랑 위 글자색

**Files:**
- Modify: `scripts/design-check.mjs`
- Modify: 14개 게임 HTML의 `<body>`
- Modify: `alkkagi.html:260,270`, `chess.html:254,264`, `connect4.html:174,184`, `dots.html:174,184`, `omok.html:170,181`, `reversi.html:174,184`, `tictactoe.html:224,232,312,320`, `yut.html:58,242,252`, `minesweeper.html:73`, `ladder.html:51`, `404.html:39-47`, `index.html:236-248`

**Interfaces:**
- Consumes: Task 1의 `--cat`, `--cat-ink`, `--accent-blue`(노랑), `--on-yellow`
- Produces: 게임 페이지 `<body data-cat="trad|brain|solo">`

| data-cat | 페이지 |
|---|---|
| `trad` | `yut`, `alkkagi`, `ttakji` |
| `brain` | `omok`, `chess`, `reversi`, `connect4`, `dots`, `tictactoe` |
| `solo` | `number-baseball`, `sudoku`, `minesweeper`, `2048`, `ladder` |

- [ ] **Step 1: 실패하는 검사 추가** — `design-check.mjs`에:
  - 위 표대로 각 게임 HTML의 `<body data-cat="…">` 값이 맞는지
  - 모든 KO HTML의 `<style>` 블록 규칙과 `style="…"` 속성 하나하나에서, `background`가 `var(--accent-blue` 또는 `var(--accent-blue-hover`를 쓰는데 같은 규칙/속성의 `color`가 `#fff`/`#ffffff`/`white`/`var(--text-main)`이거나, 그 규칙이 `:hover`이고 기본 규칙의 글자색이 밝은 경우(`ladder-top-btn`)를 FAIL로

- [ ] **Step 2: 실패 확인** — Run: `node scripts/design-check.mjs` / Expected: data-cat 14건, 노랑 위 밝은 글자 약 27건 FAIL

- [ ] **Step 3: 구현** — 14개 `<body>`에 `data-cat`. 위 Files 목록의 `background:var(--accent-blue…)`와 짝인 글자색을 `var(--on-yellow)`로(`ladder.html`은 `.ladder-top-btn:hover`에 `color: var(--on-yellow)` 추가, `index.html`의 `.play-badge`는 Task 5에서 다시 쓰지만 여기서도 글자색만 먼저 맞춘다). `number-baseball.html:79`의 `.bb-hit`(빨강+흰 글자)는 그대로

- [ ] **Step 4: 통과 확인** — Run: `node scripts/design-check.mjs` / Expected: `OK`

- [ ] **Step 5: 커밋** — `git commit -am "style: 게임 페이지 분류 색 표시, 노랑 배경 위 글자를 어두운 색으로"`

### Task 3: 공통 부품 다시 쓰기 (style.css)

**Files:**
- Modify: `style.css`(부품 규칙 전부. 게임판 규칙 `.board`, `.cell`, `.stone*`, `.star-point`, `.win-line`, `.board::before` 등은 손대지 않음)

**Interfaces:**
- Consumes: Task 1 토큰, Task 2의 `data-cat`
- Produces: 클래스 `.fx-pop`(Task 4가 붙였다 뗌: 0.3s `var(--ease-pop)`로 `scale(1)→1.08→1`), 키프레임 `popIn`(opacity 0, `translateY(12px) scale(.94)` → 원래), `cardIn`(Task 5가 홈 카드에 사용, `popIn`과 같은 모양)

각 부품의 모습은 Spec §5 표를 그대로 따른다. 결정이 필요한 값만 여기 둔다:
- 테두리 `var(--line)`(결과 창만 3px), 기본 그림자 `var(--drop)`, 판(메뉴·카드·창) 둥글기 14px, 버튼 12px, 알약 999px
- 올림 `translate(-1px,-2px)` + 그림자 `5px 6px 0 var(--ink)`, 누름 `translate(4px,4px)` + 그림자 `0 0 0 var(--ink)`, 대상 `.btn`, `.mode-btn`, `.game-nav-item`(알약 모양일 때), `.lang-toggle-btn`
- 제목 `header h1`: `var(--font-display)`, `clamp(2.4rem, 7vw, 3.6rem)`, `::after` 막대 높이 7px, `background: var(--cat)`, `border: 2px solid var(--ink)`, `rotate(-1.5deg)`. `.subtitle`: `background: var(--text-main)`, `color: var(--bg-dark)`, `rotate(1deg)`, 그림자 `2px 2px 0 var(--ink)`
- 메뉴 현재 게임 `.game-nav-item.active`: `background: var(--cat)`, `color: var(--cat-ink)`
- 주 버튼 `.btn.primary`: `background: var(--pop-yellow)`, `color: var(--on-yellow)`, `font-family: var(--font-display)`. 보조 `.btn.secondary`: `background: var(--surface-2)`, `color: var(--text-main)`
- 결과 창 제목 `.overlay:not(#room-panel) .modal h2`: `var(--font-display)`, `color: var(--pop-yellow)`, `-webkit-text-stroke: 2px var(--ink)`, `text-shadow: 4px 4px 0 var(--ink)`, `rotate(-3deg)`. `.modal h2.result-lose`는 `color: var(--text-main)`(Task 4가 패배·무승부일 때 붙인다). 창 등장: `.overlay.hidden .modal { transform: scale(.85) }` → 보일 때 `scale(1)`, `transition: transform .4s var(--ease-pop)`
- 온라인 방 창 `#room-panel`: 결과 창과 같은 판(테두리·그림자)이되 제목은 기울이거나 외곽선을 넣지 않는다(인라인 스타일 유지). 방 코드 `#room-code`는 `var(--font-display)`
- 게임판을 감싼 `.board-container`: `border: var(--line)`, `box-shadow: 6px 6px 0 var(--ink)`. 안쪽 판(`.board`)은 그대로
- 바닥글 링크 마우스 올림 `color: var(--accent-blue)`
- 모드 단계: `.game-mode-card > div { animation: popIn .4s var(--ease-pop) both; }`
- 본문 `.game-article h2`: `var(--font-display)`, 아래 막대(`::after`, 높이 5px, `var(--cat)`, 폭 48px). 목록 기호 `::before`는 10px 사각형 `background: var(--cat)`, 먹 테두리 2px, `rotate(12deg)`. 표: `border: 2px solid var(--ink)`, 머리줄 `var(--bg-dark)`, 짝수 줄 `#2f241d`. 링크 `var(--accent-blue)`
- `.game-how-to li::before`도 같은 작은 사각형 기호
- 포커스: 기존 `:focus-visible` 묶음의 `outline: 3px solid var(--pop-yellow)`
- `::selection`: `background: var(--pop-yellow); color: var(--on-yellow)`
- 숫자 `.timer-display`와 점수류: `font-variant-numeric: tabular-nums`

- [ ] **Step 1: 구현** — 위 값으로 style.css 부품 규칙을 교체. 기존 `@media (max-width: 600px)` 휴대폰 규칙(메뉴 가로 스크롤 등)과 `prefers-reduced-motion` 블록은 유지

- [ ] **Step 2: 정적 검사** — Run: `node scripts/design-check.mjs` / Expected: `OK`

- [ ] **Step 3: 브라우저 확인** — `npm run dev` 후 Playwright로 `/ttakji`(trad), `/omok`(brain), `/sudoku`(solo)를 360·1280px로 열어:
  - `document.documentElement.scrollWidth <= document.documentElement.clientWidth`(가로 넘침 없음)
  - `getComputedStyle(document.querySelector('.game-nav-item.active')).backgroundColor`가 각각 빨강·파랑·노랑, 스도쿠의 글자색이 `rgb(26, 18, 8)`
  - 모드 선택 → 한 판 시작 → 재시작 버튼까지 클릭이 그대로 동작
  - 스크린샷 3장(1280px)을 사용자에게 보여 줄 수 있게 `.playwright-mcp/`에 저장
  - impeccable 검사 결과의 대비 경고가 새로 생기지 않음

- [ ] **Step 4: 커밋** — `git commit -am "style: 공통 부품을 놀이판 팝 디자인으로"`

### Task 4: 연출 스크립트 fx.js

**Files:**
- Create: `fx.js`, `scripts/fx-check.mjs`
- Modify: `scripts/design-check.mjs`, 14개 게임 HTML(스크립트 태그)

**Interfaces:**
- Consumes: Task 3의 `.fx-pop`
- Produces: 전역 `window.FX = { isWin, countables }`(순수 함수, 검사용). DOM 연결은 즉시 실행 함수 안에서, `document`가 없으면(검사 환경) 건너뜀
  - `isWin(title: string): boolean` — `/승리|Wins?!|정답|완성|Solved|달성|reached 2048/`에 맞고 `/패배|Lose|무승부|Draw|펑|Boom|게임 오버|Game Over/`에 안 맞으면 true
  - `countables(text: string): Array<{ start: number, end: number, value: number }>` — 2 이상의 정수 토막(쉼표 자리 구분 허용, `3,024` → 3024). 앞이나 뒤가 `:`·`.`·숫자인 토막(시간 `1:23`, 소수 `3.5`)은 제외
  - 색종이 캔버스 id `fx-confetti`(position fixed, inset 0, `pointer-events: none`, z-index 결과 창보다 위)

- [ ] **Step 1: 실패하는 검사 작성** — `scripts/fx-check.mjs`(node:vm로 `fx.js` 로드, ttakji-check와 같은 방식):
  - `isWin`이 true: `'승리!'`, `'빨강 승리!'`, `'흑 승리!'`, `'You Win!'`, `'Red Wins!'`, `'Blue Wins!'`, `'정답!'`, `'완성!'`, `'Solved!'`, `'2048 달성!You reached 2048!'`
  - false: `'패배'`, `'패배...'`, `'You Lose'`, `'무승부'`, `'무승부입니다!'`, `'Draw'`, `'펑!'`, `'Boom!'`, `'게임 오버Game Over'`, `''`
  - `countables('8번 만에 맞혔습니다')` → `[{start:0,end:1,value:8}]`; `('나 7번 쳐서 5번 뒤집기 · AI 2번 쳐서 0번 뒤집기')` → 값 `[7,5,2]`(0·1 제외); `('시간 1:23')` → `[]`; `('3,024가지')` → 값 `[3024]`; `('3.5배')` → `[]`; `('2048점')` → 값 `[2048]`

- [ ] **Step 2: 실패 확인** — Run: `node scripts/fx-check.mjs` / Expected: `fx.js` 없음으로 실패

- [ ] **Step 3: 순수 함수 구현** — `fx.js`에 `isWin`, `countables`

- [ ] **Step 4: 통과 확인** — Run: `node scripts/fx-check.mjs` / Expected: `OK`

- [ ] **Step 5: DOM 연결 구현**(`fx.js`, 전부 try/catch로 감싸 실패해도 게임에 영향 없게)
  - 차례 튐: 모든 `.status-message`를 `MutationObserver({ childList, characterData, subtree })`로 보고 글자가 바뀌면 `fx-pop` 제거 → 다음 프레임에 추가
  - 결과 창: `.overlay`(단 `#room-panel` 제외)를 `attributes: ['class']`로 보고 `hidden`이 빠지는 순간 1회 처리
    - 먼저(동작 줄이기와 상관없이) 창 안 `h2`에 `result-lose` 클래스를 `!isWin(제목)`에 맞춰 붙이거나 뗀다(같은 창을 다음 판에 다시 쓰므로 떼기도 필요)
    - 그다음 `prefers-reduced-motion`이면 여기서 끝
    - `isWin(h2.textContent)`면 색종이: 캔버스 하나에 약 90조각(색 `#d63526`, `#2f6fe5`, `#ffcf3f`, 먹 테두리 1.5px), 위에서 터져 떨어지고 1.5초 뒤 캔버스 제거. `requestAnimationFrame` 사용
    - 창 안 `p`들의 텍스트 노드에서 `countables`로 찾은 숫자를 0부터 0.6초 동안 세어 올림(쉼표 형식 유지). 세는 중 노드 글자가 우리가 쓴 값과 다르면(게임이 바꿈) 즉시 중단
  - 14개 게임 HTML의 `<script src="/analytics.js?v=1" defer></script>` 앞에 `<script src="/fx.js?v=1" defer></script>`

- [ ] **Step 6: 정적 검사 추가와 확인** — `design-check.mjs`에 "14개 게임 HTML 모두 `fx.js?v=1` 포함, 홈과 그 밖의 페이지에는 없음". Run: `node scripts/design-check.mjs && node scripts/fx-check.mjs` / Expected: 둘 다 `OK`

- [ ] **Step 7: 브라우저 확인**(Playwright, `npm run dev`)
  - `/ttakji` AI 대전을 이기게 진행(어려움에서 들뜬 변 가장자리를 세기 0.9로 반복) → 결과 창이 뜨는 순간 `#fx-confetti` 존재, 2초 뒤 없음. 결과 문장 숫자가 최종값과 같음
  - `/omok` 1:1에서 진 쪽 시점 문구가 아닌 경우도 있으므로, `/minesweeper`에서 지뢰를 밟아 "펑!" → `#fx-confetti` 생기지 않음
  - `/number-baseball` 혼자 하기로 맞히기 → 결과 문장(`N번 만에 맞혔습니다`)의 N이 세어 올라간 뒤 정확한 값
  - 외부 변경: 결과 창이 뜬 직후(0.1초 안) 그 `p`의 글자를 스크립트로 `'바뀐 문장 7'`로 바꾸고 1초 뒤 확인 → 그대로 `'바뀐 문장 7'`
  - `/minesweeper` "펑!" 창과 `/ttakji` 패배 창의 `h2`에 `result-lose`가 붙고, 이어서 이긴 판에서는 떨어짐
  - 온라인 방 생성 시 `#room-panel`이 열려도 `#fx-confetti` 없음
  - `page.emulateMedia({ reducedMotion: 'reduce' })` 후 `/ttakji` 승리 → `#fx-confetti` 없음
  - 상태 글자가 바뀔 때 `.status-message`에 `fx-pop`이 붙음

- [ ] **Step 8: 커밋** — `git add fx.js scripts/fx-check.mjs && git commit -am "feat: 차례 튐·승리 색종이·숫자 세기 연출(fx.js)"`

### Task 5: 홈 화면

**Files:**
- Modify: `index.html`(인라인 `<style>` 40~320행 부근의 hub·카드·읽을거리 규칙, `header.hub-header` 마크업, 묶음 제목 마크업)

**Interfaces:**
- Consumes: Task 1 토큰, Task 3의 `cardIn`, 버튼 눌림 규칙
- Produces: 없음

Spec §7을 따른다. 결정 값:
- 첫머리 `h1`: `var(--font-display)`, `clamp(2.8rem, 9vw, 4.2rem)`, `text-shadow: 5px 5px 0 var(--ink)`, "보드"를 `<span>`으로 감싸 노랑. 기존 `ko-only`/`en-only` 구조는 유지(영문은 "Omok**board**")
- 장식 스티커 4개(빨강 사각형, 흑돌, 백돌, 파랑 사각형): `aria-hidden="true"`인 `<i class="hero-deco">`, 위치는 퍼센트로, 600px 이하에서 크기 70%로 줄이고 바깥으로 넘치지 않게 `.hub-header { overflow: hidden }` 대신 위치를 안쪽으로
- 스티커 문구 "설치 없이, 가입 없이, 바로 한 판!" / "No install, no sign-up, just play!"(ko-only/en-only). 기존 `index.subtitle` 문장은 스티커 아래 흐린 글자로 남긴다(본문 글자를 지우지 않음 → 수정일 유지 목적이 아니라 기존 설명 보존)
- 알약 "게임 14종 · AI 대전 · 온라인 대전 10종 · 한국어 / English" (en: "14 games · vs AI · 10 online · 한국어 / English")
- 묶음 제목 `.game-group-title`: 분류 색 스티커(`rotate(-1.5deg)`), 첫 묶음 빨강, 둘째 파랑, 셋째 노랑(어두운 글자). 게임 수 배지(먹 바탕 흰 글자) 3·6·5
- 카드 `.game-card`: 카드 판 + `box-shadow: 5px 5px 0 var(--c)`(묶음 section에 `style="--c:…"`), 올림/누름, 등장 `animation: cardIn .45s var(--ease-pop) backwards`, 지연은 `.game-card:nth-child(n)`마다 0.04s씩(묶음 안 순서 기준, 최대 6)
- `.play-badge`: 노랑 알약 + 먹 글자 + 먹 테두리
- 읽을거리 `.home-read`: 왼쪽 8px 색 띠(순서대로 파랑·빨강·노랑 반복)
- 휴대폰: 카드 2열 유지

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** — `node build-en.js`로 영어판 생성 후 `node scripts/design-check.mjs` OK. Playwright로 `/`와 `/en/`를 360·375·768·1280px: 가로 넘침 없음, 카드 14개 모두 보이고 클릭 시 해당 게임으로 이동, 영어판 보이는 글자에 한글은 언어 버튼("한국어")뿐
- [ ] **Step 3: 커밋** — `git commit -am "style: 홈 화면 놀이판 팝 디자인"`

### Task 6: 전체 확인과 마무리

**Files:**
- Modify: `en/*.html`, `sitemap.xml`(생성물), `page-dates.json`(바뀌면 되돌림)

- [ ] **Step 1: 영어판·배포물 생성** — Run: `node build-en.js && npm run build`
- [ ] **Step 2: 수정일 확인** — `git diff page-dates.json`에서 `modified`가 바뀐 항목이 있으면 그 항목의 `modified`를 원래 값으로 되돌림(hash는 새 값 유지). Expected: modified 변경 0건
- [ ] **Step 3: 자동 검사** — Run: `node scripts/design-check.mjs && node scripts/fx-check.mjs && node scripts/ttakji-check.mjs 2000 && npx vitest run --exclude ".claude/**"` / Expected: 전부 OK·통과
- [ ] **Step 4: 14개 게임 한 판씩** — Playwright로 각 게임 모드 선택 → 시작 → 결과 창(가능한 게임은 끝까지, 사다리타기는 결과 보기) → 다시 하기/재시작이 모드 선택으로. 콘솔 오류 0
- [ ] **Step 5: 글 페이지 훑기** — `/guides`, `/omok-guide`, `/ai-benchmarks`, `/free-board-games`, `/alkkagi-friction`, `/about`, `/404경로`를 1280·360px: 가로 넘침 없음, 표·링크 읽힘(노랑 링크)
- [ ] **Step 6: 글꼴 무게 비교** — Task 1 Step 1과 같은 방법으로 `/`, `/omok` 측정, 기준과 함께 기록
- [ ] **Step 7: 스모크** — Run: `node scripts/smoke.mjs http://localhost:8787` / Expected: `전부 통과`
- [ ] **Step 8: 커밋 후 사용자에게 보고** — 스크린샷(홈, 게임 3분류 대표, 결과 창)과 글꼴 무게 비교를 보여 주고 푸시 여부를 묻는다
