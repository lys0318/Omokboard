# 나가기 버튼 + 오목 온라인 턴 타이머 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 게임의 인게임 화면에 "나가기" 버튼을 추가하고, 오목 온라인 대전에 서버 권위 30초 턴 타이머를 붙인다.

**Architecture:** 나가기 버튼은 각 게임 HTML에 인라인 `onclick`으로 붙이는 순수 마크업 변경(게임별 JS 파일은 건드리지 않음). 온라인 타이머는 Durable Object(`worker/room.js`)가 `turnDeadline`을 저장하고 기존 단일 알람 슬롯에 세 번째 후보로 끼워 넣어, 시간 초과 시 서버가 직접 턴을 넘기고 `timeout` 메시지를 브로드캐스트한다. 클라이언트(`multiplayer.js`, `script.js`)는 그 메시지를 받아야만 턴을 반영한다.

**Tech Stack:** 바닐라 JS, Cloudflare Workers + Durable Objects, Vitest + `@cloudflare/vitest-pool-workers`.

## Global Constraints

- 나가기 이동 위치는 항상 홈(`/`), 확인창을 반드시 거친다 (스펙 §2)
- 나가기 대상은 `.controls` 패턴 11종 + 미네스위퍼(`.mine-toolbar`) = 12종 전체 (스펙 §2, §4)
- 온라인 타이머 대상은 오목뿐이다 — 다른 온라인 어댑터가 아직 없다 (스펙 §2)
- 타임아웃은 턴만 넘긴다. 자동 기권/패배 처리는 넣지 않는다 (스펙 §3)
- `en/*.html`은 손으로 고치지 않는다 — 루트 HTML만 고치고 `node build-en.js`로 재생성한다 (기존 관례)
- 정적 자산(HTML/CSS/JS) 변경 시 관련 `?v=N` 캐시 버스팅 버전을 반드시 올린다 (기존 관례, 과거에 빠뜨려 실제 장애 있었음)
- 커밋은 `git commit`으로, 훅 우회(`--no-verify`) 금지

---

## File Structure

**Feature A (나가기 버튼)** — 신규 파일 없음, 기존 파일만 수정:
- `lang.js` — 신규 i18n 키 2개 (ko/en)
- `yut.html`, `tictactoe.html`, `sudoku.html`, `reversi.html`, `ladder.html`, `dots.html`, `connect4.html`, `chess.html`, `alkkagi.html`, `2048.html`, `minesweeper.html` — 버튼 1개씩 추가 (tictactoe.html은 2군데)
- `omok.html` — 버튼 추가 + 온라인 모드 전환 시 숨김 처리

**Feature B (온라인 타이머)**:
- `worker/room.js` — `TURN_TIME_MS`, `turnDeadline` 필드, `nextAlarmAt`/`alarm()` 확장
- `test/timeout.spec.js` — 신규 테스트 파일
- `multiplayer.js` — `timeout` 메시지 처리 + 턴 전환 시점마다 타이머 재시작
- `script.js` — `startTimer()`에서 온라인 조기 리턴 제거, 로컬 턴 반전만 온라인에서 건너뜀

---

## Task 1: lang.js — 나가기 관련 i18n 키 추가

**Files:**
- Modify: `lang.js:9`, `lang.js:17` (ko 블록), `lang.js:142`, `lang.js:150` (en 블록)

**Interfaces:**
- Produces: `window.i18n.t('btn.leave')`, `window.i18n.t('game.confirmLeaveMidGame')` — 이후 모든 게임 HTML의 인라인 `onclick`이 이 키를 참조한다.

- [ ] **Step 1: ko 블록에 키 추가**

`lang.js:9`의 현재 내용:
```js
            'btn.restart': '게임 재시작', 'btn.back': '← 뒤로', 'btn.replay': '다시 하기',
```
다음으로 교체:
```js
            'btn.restart': '게임 재시작', 'btn.back': '← 뒤로', 'btn.replay': '다시 하기', 'btn.leave': '나가기',
```

`lang.js:17`의 현재 내용:
```js
            'game.win': '승리!', 'game.lose': '패배...', 'game.draw': '무승부',
```
다음으로 교체:
```js
            'game.win': '승리!', 'game.lose': '패배...', 'game.draw': '무승부',
            'game.confirmLeaveMidGame': '게임을 종료하고 나가시겠습니까?',
```

- [ ] **Step 2: en 블록에 동일 키 추가**

`lang.js:142`의 현재 내용:
```js
            'btn.restart': 'Restart', 'btn.back': '← Back', 'btn.replay': 'Play Again',
```
다음으로 교체:
```js
            'btn.restart': 'Restart', 'btn.back': '← Back', 'btn.replay': 'Play Again', 'btn.leave': 'Leave',
```

`lang.js:150`의 현재 내용:
```js
            'game.win': 'Victory!', 'game.lose': 'Defeat...', 'game.draw': 'Draw',
```
다음으로 교체:
```js
            'game.win': 'Victory!', 'game.lose': 'Defeat...', 'game.draw': 'Draw',
            'game.confirmLeaveMidGame': 'End the game and leave?',
```

- [ ] **Step 3: 문법 확인**

Run: `node -e "require('./lang.js')"` — 에러 없이 조용히 끝나야 한다 (이 파일은 `(function(){...})()` IIFE라 브라우저 전역 없이 실행해도 문법 오류만 있으면 즉시 튄다).

- [ ] **Step 4: 커밋**

```bash
git add lang.js
git commit -m "feat: 나가기 버튼용 i18n 키 추가 (btn.leave, game.confirmLeaveMidGame)"
```

---

## Task 2: 11개 게임에 나가기 버튼 추가 (omok 제외)

**Files:**
- Modify: `yut.html:137`, `tictactoe.html:157`, `tictactoe.html:185`, `sudoku.html:161`, `reversi.html:114`, `ladder.html:131`, `dots.html:114`, `connect4.html:114`, `chess.html:194`, `alkkagi.html:138`, `2048.html:153`, `minesweeper.html:139`

**Interfaces:**
- Consumes: `window.i18n.t('game.confirmLeaveMidGame')` (Task 1에서 정의)

모든 삽입은 같은 마크업이다:
```html
<button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
```

- [ ] **Step 1: yut.html**

`yut.html:136-138`의 현재 내용:
```html
            <div class="controls" style="margin-top:0.25rem;">
                <button id="yut-reset-btn" class="btn secondary" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls" style="margin-top:0.25rem;">
                <button id="yut-reset-btn" class="btn secondary" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 2: tictactoe.html (두 군데 — 일반 모드, Ultimate 모드)**

`tictactoe.html:157`의 현재 내용:
```html
                <div class="controls"><button id="ttt-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button></div>
```
다음으로 교체:
```html
                <div class="controls"><button id="ttt-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button><button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button></div>
```

`tictactoe.html:185`의 현재 내용:
```html
                <div class="controls"><button id="uttt-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button></div>
```
다음으로 교체:
```html
                <div class="controls"><button id="uttt-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button><button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button></div>
```

- [ ] **Step 3: sudoku.html**

`sudoku.html:160-162`의 현재 내용:
```html
            <div class="controls">
                <button id="sudoku-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls">
                <button id="sudoku-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 4: reversi.html**

`reversi.html:113-115`의 현재 내용:
```html
            <div class="controls">
                <button class="btn primary" id="rev-restart-btn" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls">
                <button class="btn primary" id="rev-restart-btn" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 5: ladder.html**

`ladder.html:128-132`의 현재 내용:
```html
            <div class="controls">
                <button id="ladder-shuffle-btn" class="btn secondary"><span class="ko-only">다시 섞기</span><span class="en-only" style="display:none;">Reshuffle</span></button>
                <button id="ladder-revealall-btn" class="btn secondary"><span class="ko-only">전체 공개</span><span class="en-only" style="display:none;">Reveal All</span></button>
                <button id="ladder-reset-btn" class="btn primary"><span class="ko-only">처음부터</span><span class="en-only" style="display:none;">Start Over</span></button>
            </div>
```
다음으로 교체:
```html
            <div class="controls">
                <button id="ladder-shuffle-btn" class="btn secondary"><span class="ko-only">다시 섞기</span><span class="en-only" style="display:none;">Reshuffle</span></button>
                <button id="ladder-revealall-btn" class="btn secondary"><span class="ko-only">전체 공개</span><span class="en-only" style="display:none;">Reveal All</span></button>
                <button id="ladder-reset-btn" class="btn primary"><span class="ko-only">처음부터</span><span class="en-only" style="display:none;">Start Over</span></button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 6: dots.html**

`dots.html:113-115`의 현재 내용:
```html
            <div class="controls">
                <button class="btn primary" id="dots-restart-btn" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls">
                <button class="btn primary" id="dots-restart-btn" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 7: connect4.html**

`connect4.html:113-115`의 현재 내용:
```html
            <div class="controls">
                <button class="btn primary" id="c4-restart-btn" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls">
                <button class="btn primary" id="c4-restart-btn" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 8: chess.html**

`chess.html:193-195`의 현재 내용:
```html
            <div class="controls" style="margin-top:0.5rem;">
                <button class="btn primary" id="chess-restart-btn" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls" style="margin-top:0.5rem;">
                <button class="btn primary" id="chess-restart-btn" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 9: alkkagi.html**

`alkkagi.html:137-139`의 현재 내용:
```html
            <div class="controls" style="margin-top:0.5rem;">
                <button class="btn primary" id="ak-reset-btn" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls" style="margin-top:0.5rem;">
                <button class="btn primary" id="ak-reset-btn" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 10: 2048.html**

`2048.html:152-154`의 현재 내용:
```html
            <div class="controls">
                <button id="g2048-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="controls">
                <button id="g2048-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 11: minesweeper.html**

`minesweeper.html:137-140`의 현재 내용:
```html
            <div class="mine-toolbar">
                <button id="mine-flag-toggle" class="btn secondary flag-toggle">🚩 <span class="ko-only">깃발 모드</span><span class="en-only" style="display:none;">Flag Mode</span></button>
                <button id="mine-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
            </div>
```
다음으로 교체:
```html
            <div class="mine-toolbar">
                <button id="mine-flag-toggle" class="btn secondary flag-toggle">🚩 <span class="ko-only">깃발 모드</span><span class="en-only" style="display:none;">Flag Mode</span></button>
                <button id="mine-reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
                <button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'"><span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span></button>
            </div>
```

- [ ] **Step 12: 커밋**

```bash
git add yut.html tictactoe.html sudoku.html reversi.html ladder.html dots.html connect4.html chess.html alkkagi.html 2048.html minesweeper.html
git commit -m "feat: 로컬 모드 인게임 화면에 나가기 버튼 추가 (11종)"
```

---

## Task 3: omok.html — 나가기 버튼 (로컬/온라인 전환 처리 포함)

omok.html은 이미 온라인 전용 `#online-leave-mid-btn`이 있고, `begin()` 함수가 온라인 시작 시 `#reset-btn`을 숨긴다. 새 로컬 나가기 버튼도 온라인 시작 시 같이 숨겨야 두 개의 "나가기"가 겹치지 않는다.

**Files:**
- Modify: `omok.html:116-121` (컨트롤 마크업), `omok.html:377-380` (`begin()` 함수)

**Interfaces:**
- Consumes: `window.i18n.t('game.confirmLeaveMidGame')` (Task 1)

- [ ] **Step 1: 컨트롤에 로컬 나가기 버튼 추가**

`omok.html:116-121`의 현재 내용:
```html
            <div class="controls">
                <button id="reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
                <button id="online-leave-mid-btn" class="btn secondary hidden">
                    <span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span>
                </button>
            </div>
```
다음으로 교체:
```html
            <div class="controls">
                <button id="reset-btn" class="btn primary" data-i18n="btn.restart">게임 재시작</button>
                <button id="local-leave-btn" class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'">
                    <span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span>
                </button>
                <button id="online-leave-mid-btn" class="btn secondary hidden">
                    <span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span>
                </button>
            </div>
```

- [ ] **Step 2: 온라인 시작 시 로컬 나가기 버튼도 숨김**

`omok.html:377-380`의 현재 내용:
```js
        // 온라인 대전에서는 "게임 재시작" 대신 "나가기"를 쓴다 — 재시작은
        // 서버에 알리지 않고 모드 화면만 여는 로컬 동작이라 온라인 상태와 어긋난다.
        document.getElementById('reset-btn').classList.add('hidden');
        document.getElementById('online-leave-mid-btn').classList.remove('hidden');
```
다음으로 교체:
```js
        // 온라인 대전에서는 "게임 재시작" 대신 "나가기"를 쓴다 — 재시작은
        // 서버에 알리지 않고 모드 화면만 여는 로컬 동작이라 온라인 상태와 어긋난다.
        document.getElementById('reset-btn').classList.add('hidden');
        document.getElementById('local-leave-btn').classList.add('hidden');
        document.getElementById('online-leave-mid-btn').classList.remove('hidden');
```

- [ ] **Step 3: 커밋**

```bash
git add omok.html
git commit -m "feat: 오목 로컬 모드에 나가기 버튼 추가, 온라인 전환 시 숨김 처리"
```

---

## Task 4: Feature A 검증 및 배포

**Files:**
- Modify: 모든 소스 HTML(루트 + `en/`)의 `lang.js?v=N` — `lang.js` 내용이 바뀌었으므로 캐시 버스팅 버전을 반드시 올려야 한다. 지난번 아이콘 교체 때 이 버전을 안 올려서 캐시된 유저에게 빈 아이콘이 보이던 실제 장애가 있었다(같은 함정, `game.confirmLeaveMidGame` 키가 옛 캐시엔 없어 confirm 창에 "undefined"가 뜨게 된다).
- Modify: `en/*.html` (재생성)
- Modify: `dist/` (재생성, git에는 안 올라감)

**Interfaces:**
- Consumes: Task 1–3에서 만든 모든 HTML/lang.js 변경

- [ ] **Step 1: lang.js 캐시 버스팅 버전 일괄 교체**

```bash
grep -n 'lang\.js?v=' omok.html
```
현재 버전(`v=6`)을 확인한 뒤, `dist/`와 `.claude/worktrees/`를 제외한 모든 소스 HTML에서 `v=7`로 올린다:
```bash
grep -rl 'lang\.js?v=6' --include="*.html" . | grep -v '^\./dist/' | grep -v '^\./\.claude/worktrees/' | xargs sed -i 's/lang\.js?v=6/lang.js?v=7/g'
```
Expected: 루트 12개 게임 페이지 + 기타 페이지 + `en/` 미러 전부 포함해 다수 파일이 바뀐다. 확인:
```bash
grep -c 'lang\.js?v=7' -r --include="*.html" . | grep -v ':0' | grep -v '^\./dist/' | grep -v '^\./\.claude/worktrees/' | wc -l
```

- [ ] **Step 2: EN 미러 재생성 및 빌드**

```bash
node build-en.js
npm run build
```
Expected: `Generated 34 EN pages + sitemap` / `dist/ 생성 완료` — 에러 없이 끝나야 한다. (Step 1에서 이미 `en/`도 `sed`로 바꿨지만, `build-en.js`는 루트 HTML을 기준으로 `en/`을 통째로 재생성하므로 다시 돌려 확실히 동기화한다.)

- [ ] **Step 3: 전체 테스트 스위트 실행**

```bash
npm test
```
Expected: 기존 통과 개수 그대로 전부 PASS (이번 태스크는 룸 로직을 건드리지 않으므로 테스트 개수 변화 없음).

- [ ] **Step 4: 모바일 레이아웃 확인 (375px)**

Browser 프리뷰에서 `static-server`로 `sudoku.html`, `omok.html`, `ladder.html`(버튼 4개로 가장 붐빔)을 375×812로 열어 나가기 버튼이 잘리지 않는지 확인한다. 잘리면 `.controls`에 `flex-wrap: wrap;`을 추가한다(이미 다른 곳에서 쓰는 패턴).

- [ ] **Step 5: 나가기 동작 수동 확인**

아무 게임에서나 나가기 클릭 → confirm 창 텍스트가 "게임을 종료하고 나가시겠습니까?"로 뜨는지(placeholder처럼 "undefined"가 뜨면 lang.js 버전이 안 맞는 것) → 확인 누르면 `/`로 이동하는지 확인. 오목은 온라인 모드로 들어가서 로컬 나가기 버튼이 사라지고 기존 온라인 나가기 버튼만 보이는지 확인.

- [ ] **Step 6: 커밋 및 배포**

```bash
git add -A
git commit -m "chore: lang.js 캐시 버전 올림 + EN 미러 재생성 (나가기 버튼 반영)"
git push origin main
```

- [ ] **Step 7: 배포 확인**

```bash
for i in $(seq 1 20); do
  if curl -s https://omokboard.com/omok | grep -q 'lang.js?v=7'; then
    echo "SUCCESS -- lang.js?v=7 live after $((i*15))s"
    break
  fi
  sleep 15
done
```
30~60초 내 안 나오면 Workers Builds 배포가 아직 진행 중이니 좀 더 기다렸다 재시도한다.

---

## Task 5: worker/room.js — 서버 권위 턴 타이머

**Files:**
- Modify: `worker/room.js:1-2` (상수), `worker/room.js:51-79` (`onMove`), `worker/room.js:113-147` (`onRematch`), `worker/room.js:150-182` (`nextAlarmAt`/`rescheduleAlarm`/`alarm`), `worker/room.js:208-293` (`onJoin`), `worker/room.js:296-318` (`create`), `worker/room.js:83-108` (`onLeave`)
- Create: `test/timeout.spec.js`

**Interfaces:**
- Produces: DO storage 필드 `turnDeadline` (ms epoch 또는 `null`), 브로드캐스트 메시지 `{ type: 'timeout', seq, turn }`
- Consumes: 없음 (룸 로직 내부 완결)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/timeout.spec.js` 생성:
```js
import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

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

async function setup() {
  const res = await SELF.fetch('https://example.com/api/room', {
    method: 'POST',
    body: JSON.stringify({ gameId: 'omok' }),
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- timeout.spec`
Expected: FAIL — `instance.nextAlarmAt is not a function`이거나 `turnDeadline`이 `undefined`라 첫 두 테스트부터 실패. (`nextAlarmAt`은 이미 존재하지만 `status`/`turnDeadline` 인자를 안 받으므로 첫 테스트의 기댓값과 어긋남)

- [ ] **Step 3: room.js 구현**

`worker/room.js:1-2`의 현재 내용:
```js
const GRACE_MS = 120_000; // 재접속 유예 2분
const ROOM_TTL_MS = 1_800_000; // 방 유지 30분
```
다음으로 교체:
```js
const GRACE_MS = 120_000; // 재접속 유예 2분
const ROOM_TTL_MS = 1_800_000; // 방 유지 30분
const TURN_TIME_MS = 30_000; // 턴 제한 시간 (로컬/AI 모드와 동일)
```

`worker/room.js`의 `onMove` 메서드 (현재 51-79행) 중 `storage.put`과 그 이후:
```js
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
다음으로 교체:
```js
    await this.ctx.storage.put({
      seq: nextSeq,
      turn: nextTurn,
      occupied: [...occupied],
      state: msg.move?.state ?? room.get('state'),
      turnDeadline: Date.now() + TURN_TIME_MS,
      lastActivityAt: Date.now(),
    });

    this.broadcast({ type: 'move', move: msg.move, seq: nextSeq, turn: nextTurn });
    await this.rescheduleAlarm();
  }
```

`onLeave` 메서드(현재 83-108행) 중 `storage.put` 부분:
```js
    await this.ctx.storage.put({
      players,
      status: 'waiting',
      turn: 'black',
      seq: 0,
      occupied: [],
      state: null,
      rematchReady: {},
      graceDeadline: null,
      lastActivityAt: Date.now(),
    });
```
다음으로 교체:
```js
    await this.ctx.storage.put({
      players,
      status: 'waiting',
      turn: 'black',
      seq: 0,
      occupied: [],
      state: null,
      rematchReady: {},
      graceDeadline: null,
      turnDeadline: null,
      lastActivityAt: Date.now(),
    });
```

`onRematch` 메서드(현재 113-147행)의 `bothReady` 분기:
```js
      if (bothReady) {
        await this.ctx.storage.put({
          status: 'playing',
          turn: 'black',
          seq: 0,
          occupied: [],
          state: null,
          rematchReady: {},
          lastActivityAt: Date.now(),
        });
      } else {
```
다음으로 교체:
```js
      if (bothReady) {
        await this.ctx.storage.put({
          status: 'playing',
          turn: 'black',
          seq: 0,
          occupied: [],
          state: null,
          rematchReady: {},
          turnDeadline: Date.now() + TURN_TIME_MS,
          lastActivityAt: Date.now(),
        });
      } else {
```

`nextAlarmAt`/`rescheduleAlarm`(현재 150-161행) 전체:
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
```
다음으로 교체:
```js
  // 알람은 DO당 하나뿐이다. 유예·만료·턴 타임아웃 중 이른 시각을 쓴다.
  // 턴 타임아웃은 playing 상태일 때만 후보로 넣는다 — 상대가 끊겨 paused가 되면
  // 유예(2분)만 남고 턴 시계는 자연히 멈춘다.
  nextAlarmAt({ graceDeadline, roomExpiresAt, turnDeadline, status }) {
    const candidates = [roomExpiresAt];
    if (graceDeadline != null) candidates.push(graceDeadline);
    if (status === 'playing' && turnDeadline != null) candidates.push(turnDeadline);
    return Math.min(...candidates);
  }

  async rescheduleAlarm() {
    const r = await this.ctx.storage.get(['graceDeadline', 'roomExpiresAt', 'turnDeadline', 'status']);
    const at = this.nextAlarmAt({
      graceDeadline: r.get('graceDeadline') ?? null,
      roomExpiresAt: r.get('roomExpiresAt') ?? Date.now() + ROOM_TTL_MS,
      turnDeadline: r.get('turnDeadline') ?? null,
      status: r.get('status'),
    });
    await this.ctx.storage.setAlarm(at);
  }
```

`alarm()` 메서드(현재 163-182행) 전체:
```js
  async alarm() {
    const r = await this.ctx.storage.get(['status', 'graceDeadline', 'roomExpiresAt']);
    const now = Date.now();
    const grace = r.get('graceDeadline');

    // 유예 마감이 먼저 도래한 경우
    if (r.get('status') === 'paused' && grace != null && now >= grace) {
      await this.ctx.storage.put({ status: 'finished', graceDeadline: null });
      this.broadcast({ type: 'status', status: 'finished', reason: 'OPPONENT_LEFT' });
      await this.rescheduleAlarm();
      return;
    }
    // 방 만료
    if (now >= (r.get('roomExpiresAt') ?? 0)) {
      this.broadcast({ type: 'status', status: 'finished', reason: 'ROOM_EXPIRED' });
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.rescheduleAlarm();
  }
```
다음으로 교체:
```js
  async alarm() {
    const r = await this.ctx.storage.get([
      'status', 'graceDeadline', 'roomExpiresAt', 'turnDeadline', 'turn', 'seq',
    ]);
    const now = Date.now();
    const status = r.get('status');
    const grace = r.get('graceDeadline');

    // 유예 마감이 먼저 도래한 경우
    if (status === 'paused' && grace != null && now >= grace) {
      await this.ctx.storage.put({ status: 'finished', graceDeadline: null, turnDeadline: null });
      this.broadcast({ type: 'status', status: 'finished', reason: 'OPPONENT_LEFT' });
      await this.rescheduleAlarm();
      return;
    }
    // 방 만료
    if (now >= (r.get('roomExpiresAt') ?? 0)) {
      this.broadcast({ type: 'status', status: 'finished', reason: 'ROOM_EXPIRED' });
      await this.ctx.storage.deleteAll();
      return;
    }
    // 턴 시간 초과 — 승패 처리 없이 턴만 넘긴다
    const turnDeadline = r.get('turnDeadline');
    if (status === 'playing' && turnDeadline != null && now >= turnDeadline) {
      const nextTurn = r.get('turn') === 'black' ? 'white' : 'black';
      const nextSeq = (r.get('seq') ?? 0) + 1;
      await this.ctx.storage.put({
        turn: nextTurn,
        seq: nextSeq,
        turnDeadline: now + TURN_TIME_MS,
        lastActivityAt: now,
      });
      this.broadcast({ type: 'timeout', seq: nextSeq, turn: nextTurn });
    }
    await this.rescheduleAlarm();
  }
```

`onJoin`(현재 208-293행)의 `blockConcurrencyWhile` 안 `storage.put` 부분:
```js
      const status = players.black && players.white ? 'playing' : 'waiting';
      const wasPaused = room.get('status') === 'paused';
      await this.ctx.storage.put({
        players,
        status,
        graceDeadline: null, // 돌아왔으니 유예 해제
        roomExpiresAt: Date.now() + ROOM_TTL_MS,
        lastActivityAt: Date.now(),
      });
```
다음으로 교체:
```js
      const status = players.black && players.white ? 'playing' : 'waiting';
      const wasPaused = room.get('status') === 'paused';
      await this.ctx.storage.put({
        players,
        status,
        graceDeadline: null, // 돌아왔으니 유예 해제
        turnDeadline: status === 'playing' ? Date.now() + TURN_TIME_MS : null,
        roomExpiresAt: Date.now() + ROOM_TTL_MS,
        lastActivityAt: Date.now(),
      });
```

`create()`(현재 296-318행)의 `storage.put` 부분:
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
      rematchReady: {},
    });
```
다음으로 교체:
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
      turnDeadline: null,
      rematchReady: {},
    });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- timeout.spec`
Expected: 5개 테스트 모두 PASS.

- [ ] **Step 5: 기존 테스트 회귀 확인**

Run: `npm test`
Expected: 기존 `alarm.spec.js`의 `nextAlarmAt` 테스트 2개(2-인자 호출)도 포함해 전체 PASS. (`status`/`turnDeadline`을 안 넘기면 `undefined`가 되어 `status === 'playing'` 조건이 항상 false이므로 기존 동작과 동일하게 유지된다.)

- [ ] **Step 6: 커밋**

```bash
git add worker/room.js test/timeout.spec.js
git commit -m "feat: 오목 온라인 대전에 서버 권위 30초 턴 타이머 추가 (room.js)"
```

---

## Task 6: multiplayer.js — timeout 메시지 처리 + 타이머 재시작

**Files:**
- Modify: `multiplayer.js:100-166` (`handle` 함수)

**Interfaces:**
- Consumes: `worker/room.js`가 보내는 `{ type: 'timeout', seq, turn }` (Task 5)
- Consumes: `game.startTimer()`, `game.updateUI()` — `OmokGame`(script.js)의 기존 공개 메서드

- [ ] **Step 1: `joined` 케이스에 타이머 시작 추가**

`multiplayer.js`의 현재 내용:
```js
      case 'joined':
        session.color = msg.color;
        session.seq = msg.seq;
        session.graceUntil = 0;
        if (msg.token) store.setItem(tokenKey(session.code), msg.token);
        // state.turn은 착수 시점(턴 전환 전) 값이라 한 수 밀린다. 서버 turn으로 덮어쓴다.
        if (msg.state) adapter.restore(game, { ...msg.state, turn: msg.turn || msg.state.turn });
        bindLocalMoves(session);
        ui.onCode(session.code, shareUrl(session.code));
        ui.onColor(msg.color);
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
```
다음으로 교체:
```js
      case 'joined':
        session.color = msg.color;
        session.seq = msg.seq;
        session.graceUntil = 0;
        if (msg.token) store.setItem(tokenKey(session.code), msg.token);
        // state.turn은 착수 시점(턴 전환 전) 값이라 한 수 밀린다. 서버 turn으로 덮어쓴다.
        if (msg.state) adapter.restore(game, { ...msg.state, turn: msg.turn || msg.state.turn });
        bindLocalMoves(session);
        ui.onCode(session.code, shareUrl(session.code));
        ui.onColor(msg.color);
        ui.onStatus(msg.status, { color: msg.color });
        if (msg.status === 'playing') game.startTimer();
        updateInput(session);
        break;

      case 'move':
        session.seq = msg.seq;
        // 내가 둔 수가 되돌아온 경우엔 이미 화면에 반영돼 있다.
        if (msg.move && msg.move.by !== session.color) {
          adapter.applyMove(game, msg.move);
        }
        game.startTimer(); // 서버가 턴을 넘겼으니 30초 카운트다운을 새로 시작
        updateInput(session);
        break;

      case 'timeout':
        // 시간 초과로 서버가 직접 턴을 넘긴 경우. 실제 착수가 없었으므로
        // applyMove는 부르지 않고 턴 표시와 카운트다운만 갱신한다.
        session.seq = msg.seq;
        game.currentTurn = msg.turn;
        game.updateUI();
        game.startTimer();
        updateInput(session);
        break;

      case 'rejected':
```

- [ ] **Step 2: `status` 케이스에 타이머 시작 추가**

`multiplayer.js`의 현재 내용:
```js
      case 'status':
        // 상대가 "나가기"로 방을 떠난 경우: 새 상대를 기다리는 화면으로 돌아간다.
        // 지난 판이 화면에 남아있지 않도록 여기서 로컬 보드도 함께 비운다.
        if (msg.reason === 'OPPONENT_LEFT_ROOM') {
          session.seq = 0;
          game.resetGame();
        }
        ui.onStatus(msg.status, msg);
        updateInput(session);
        break;
```
다음으로 교체:
```js
      case 'status':
        // 상대가 "나가기"로 방을 떠난 경우: 새 상대를 기다리는 화면으로 돌아간다.
        // 지난 판이 화면에 남아있지 않도록 여기서 로컬 보드도 함께 비운다.
        if (msg.reason === 'OPPONENT_LEFT_ROOM') {
          session.seq = 0;
          game.resetGame();
        }
        ui.onStatus(msg.status, msg);
        // 정원이 차서 playing으로 바뀐 순간(상대가 막 들어온 쪽)에도 카운트다운 시작
        if (msg.status === 'playing') game.startTimer();
        updateInput(session);
        break;
```

- [ ] **Step 3: 커밋**

```bash
git add multiplayer.js
git commit -m "feat: 클라이언트에서 온라인 timeout 메시지 처리 및 턴마다 타이머 재시작"
```

---

## Task 7: script.js — startTimer()가 온라인에서도 카운트다운을 보여주게

**Files:**
- Modify: `script.js:220-259` (`startTimer`)

**Interfaces:**
- Consumes: 없음
- Produces: `startTimer()` 동작 변경 — 이후 `multiplayer.js`(Task 6)가 온라인 모드에서 이 메서드를 불러도 더 이상 즉시 리턴하지 않고 실제 카운트다운을 그린다.

- [ ] **Step 1: 온라인 조기 리턴 제거, 로컬 턴 반전만 온라인에서 건너뛰기**

`script.js:222-259`의 현재 내용:
```js
    startTimer() {
        // 온라인 대전은 턴이 서버 권위다. 클라이언트 타이머가 제멋대로 턴을 넘기면
        // 양쪽 판이 어긋난다(서버는 이 전환을 모른다). 온라인에선 타이머를 돌리지 않는다.
        if (this.gameMode === 'online') {
            clearInterval(this.timerInterval);
            this.timerDisplayElement.textContent = '-';
            this.timerDisplayElement.classList.remove('urgent');
            return;
        }

        // AI 차례엔 타이머 없음
        if (this.gameMode === 'ai' && this.currentTurn === 'white') {
            this.timerDisplayElement.textContent = '-';
            this.timerDisplayElement.classList.remove('urgent');
            return;
        }

        clearInterval(this.timerInterval);
        this.timeLeft = 30;
        this.updateTimerDisplay();

        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.currentTurn = this.currentTurn === 'black' ? 'white' : 'black';
                this.updateUI();
                this.startTimer();

                // AI 모드에서 시간 초과로 AI 차례가 됐을 경우
                if (this.gameMode === 'ai' && this.currentTurn === 'white') {
                    this.scheduleAIMove();
                }
            }
        }, 1000);
    }
```
다음으로 교체:
```js
    startTimer() {
        // AI 차례엔 타이머 없음
        if (this.gameMode === 'ai' && this.currentTurn === 'white') {
            this.timerDisplayElement.textContent = '-';
            this.timerDisplayElement.classList.remove('urgent');
            return;
        }

        clearInterval(this.timerInterval);
        this.timeLeft = 30;
        this.updateTimerDisplay();

        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);

                // 온라인 대전은 턴이 서버 권위다. 여기서 턴을 넘기지 않고
                // 서버의 move/timeout 메시지가 와야 반영한다(양쪽 판 어긋남 방지).
                if (this.gameMode === 'online') return;

                this.currentTurn = this.currentTurn === 'black' ? 'white' : 'black';
                this.updateUI();
                this.startTimer();

                // AI 모드에서 시간 초과로 AI 차례가 됐을 경우
                if (this.gameMode === 'ai' && this.currentTurn === 'white') {
                    this.scheduleAIMove();
                }
            }
        }, 1000);
    }
```

- [ ] **Step 2: 로컬/AI 모드 회귀 확인**

Run: `npm test`
Expected: 전체 PASS (이 파일은 브라우저 클라이언트 코드라 Vitest 대상이 아니지만, 다른 테스트가 이 변경으로 깨지지 않는지 확인).

- [ ] **Step 3: 커밋**

```bash
git add script.js
git commit -m "feat: 오목 온라인 대전에서도 30초 카운트다운 UI 표시"
```

---

## Task 8: Feature B 수동 검증 및 배포

**Files:**
- Modify: `omok.html`, `en/omok.html`의 `script.js?v=N`과 `multiplayer.js?v=N` — 이 두 스크립트를 쓰는 페이지는 오목뿐이다(온라인 대전이 오목 전용이므로). `style.css`/`lang.js`는 이번 태스크에서 안 건드렸으니 버전 그대로 둔다.

**Interfaces:**
- Consumes: Task 5–7의 모든 변경

- [ ] **Step 1: 캐시 버스팅 버전 확인**

```bash
grep -n 'script\.js?v=\|multiplayer\.js?v=' omok.html
```
현재 `script.js?v=4`, `multiplayer.js?v=1`을 확인한다. `script.js`는 Task 7에서, `multiplayer.js`는 Task 6에서 내용이 바뀌었으므로 둘 다 올려야 한다.

- [ ] **Step 2: 버전 일괄 교체**

```bash
sed -i 's/script\.js?v=4/script.js?v=5/; s/multiplayer\.js?v=1/multiplayer.js?v=2/' omok.html
node build-en.js
```
Expected: `en/omok.html`도 `script.js?v=5`, `multiplayer.js?v=2`로 재생성됨. 확인:
```bash
grep -n 'script\.js?v=\|multiplayer\.js?v=' en/omok.html
```

- [ ] **Step 3: 두 브라우저로 수동 확인**

`worker-dev`(wrangler dev, DO 알람이 실제로 동작하는 유일한 환경 — `static-server`는 워커가 없으므로 이번 기능은 검증 불가)로 오목 온라인 대전을 두 탭에서 시작:
1. 방 만들기 → 다른 탭에서 참가 → 양쪽 다 "흑의 차례" 카운트다운이 30부터 도는지 확인
2. 한쪽에서 30초간 아무 수도 두지 않음 → 카운트다운 0 도달 후 곧 상대 턴으로 넘어가는지, 양쪽 화면의 턴 표시가 일치하는지 확인
3. 정상적으로 수를 두면 그때마다 카운트다운이 30으로 리셋되는지 확인
4. 한쪽 탭을 닫아 끊김 상태(paused)를 만들고, 2분 유예 로직이 이번 변경으로 깨지지 않았는지 확인(기존 동작 그대로 "OPPONENT_LEFT" 처리)

- [ ] **Step 4: 전체 테스트 스위트 + 빌드**

```bash
npm test
npm run build
```
Expected: 전체 PASS, 빌드 정상 완료.

- [ ] **Step 5: 커밋 및 배포**

```bash
git add omok.html en/omok.html
git commit -m "chore: script.js/multiplayer.js 캐시 버전 올림 (온라인 턴 타이머 반영)"
git push origin main
```

- [ ] **Step 6: 배포 확인**

```bash
for i in $(seq 1 20); do
  if curl -s https://omokboard.com/omok | grep -q 'multiplayer.js?v=2'; then
    echo "SUCCESS -- multiplayer.js?v=2 live after $((i*15))s"
    break
  fi
  sleep 15
done
```

- [ ] **Step 7: 배포 환경에서 최종 확인**

`omokboard.com`에서 실제로 온라인 방을 만들어 다른 기기/탭으로 접속, 30초 타임아웃이 프로덕션에서도 동작하는지 한 번 더 확인한다.
