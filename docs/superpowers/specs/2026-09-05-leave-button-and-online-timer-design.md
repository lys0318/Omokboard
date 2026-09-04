# 인게임 "나가기" 버튼 + 오목 온라인 30초 턴 타이머

작성일: 2026-09-05
상태: 승인됨 (구현 전)

## 1. 목표

두 가지 독립적인 개선을 한 번에 처리한다.

- **A. 나가기 버튼**: 로컬(1:1/AI) 모드 게임 화면엔 "게임 재시작"만 있고 도중에 나가는 버튼이 없다. 온라인 대전에는 이미 있는 패턴을 전체 게임에 맞춘다.
- **B. 온라인 턴 타이머**: 로컬/AI 모드는 30초 턴 타이머가 있는데 오목 온라인 대전만 없다. 다른 모드와 동일하게 시간 초과 시 다음 플레이어로 턴이 넘어가야 한다.

## 2. 확정 요구사항

| 항목 | 결정 |
|---|---|
| 나가기 이동 위치 | 홈(`/`) — 기존 온라인 나가기 버튼과 동일 |
| 나가기 확인창 | 표시함 ("게임을 종료하고 나가시겠습니까?") |
| 나가기 대상 | `.controls` 패턴 게임 11종 + 미네스위퍼(`.mine-toolbar`) = 12종 전체 |
| 턴 타이머 대상 | 오목 온라인 대전만 (다른 게임은 온라인 어댑터 자체가 없음) |
| 타임아웃 처리 | 턴만 다음 사람에게 넘김. 승패 처리 없음 |

## 3. 비목표 (YAGNI)

- 타임아웃 반복 시 자동 기권/패배 처리 — 상대가 아예 접속을 끊으면 기존 유예(2분) → `finished` 로직이 따로 처리한다
- 온라인 타이머를 오목 외 다른 온라인 어댑터에도 미리 일반화 — 지금 온라인 어댑터는 오목뿐이다
- 나가기 버튼에 "홈 대신 모드 선택으로" 같은 옵션 분기 — 항상 홈으로 고정

## 4. 설계 A — 나가기 버튼

**마크업** (기존 온라인 나가기 버튼과 동일한 스팬 패턴, 게임마다 `.controls`/`.mine-toolbar`에 한 줄 추가):

```html
<button class="btn secondary" onclick="if(confirm(window.i18n.t('game.confirmLeaveMidGame')))location.href='/'">
    <span class="ko-only">나가기</span><span class="en-only" style="display:none;">Leave</span>
</button>
```

인라인 `onclick`이라 게임별 JS 파일(chess.js, sudoku.js…)은 건드리지 않는다. `window.i18n`은 `lang.js`가 각 게임 스크립트보다 먼저 로드되므로 항상 사용 가능하다.

**`lang.js` 신규 키** (한/영 두 블록 모두):

```js
'game.confirmLeaveMidGame': '게임을 종료하고 나가시겠습니까?',
// en: 'End the game and leave?'
```

**omok.html은 예외**: 이미 온라인 전용 `#online-leave-mid-btn`이 있고 서버에 `leave`를 통지하는 별도 로직(`doLeave()`)이 있다. 로컬 모드(`#reset-btn`이 보이는 상태)에만 새 나가기 버튼을 추가하고, 온라인 모드로 전환될 때 기존 코드처럼 새 버튼도 함께 숨긴다.

**스코프**: 11개 `.controls` 게임 + 미네스위퍼(`.mine-toolbar`, 기존 "깃발 모드" 버튼 옆). 모바일에서 버튼 2개가 잘리지 않는지 375px에서 확인한다.

## 5. 설계 B — 온라인 턴 타이머

로컬/AI 모드는 클라이언트가 턴 권위를 가지므로 `setInterval`로 30초를 세다가 0이 되면 그냥 `this.currentTurn`을 뒤집는다. 온라인은 서버(Durable Object)가 턴 권위를 가지므로 **서버가 시간을 재고, 넘김을 브로드캐스트해야** 양쪽 화면이 어긋나지 않는다.

### 5.1 서버 (`worker/room.js`)

새 상수: `const TURN_TIME_MS = 30_000;`

새 저장 필드: `turnDeadline` (ms epoch, `status === 'playing'`일 때만 의미 있음)

**언제 갱신하는가**:

| 시점 | 처리 |
|---|---|
| `onJoin`에서 `status`가 `playing`으로 계산될 때 (입장·재접속으로 두 자리가 다 찼을 때) | `turnDeadline = now + TURN_TIME_MS` |
| `onMove` 성공(수 반영) | `turnDeadline = now + TURN_TIME_MS` |
| `onRematch`의 `bothReady` 분기 | `turnDeadline = now + TURN_TIME_MS` |
| `onLeave`, 유예 종료(`finished`) | `turnDeadline = null` |

세 경우 모두 기존 코드처럼 필드를 바꾼 뒤 `rescheduleAlarm()`을 호출한다(이미 `onJoin`/`onRematch`/`onLeave`는 호출하고 있음 — `onMove`에 새로 추가).

**알람은 DO당 하나뿐**이라는 기존 제약(`nextAlarmAt`)에 `turnDeadline`을 세 번째 후보로 추가한다. `status === 'playing'`일 때만 후보에 넣어서, 한쪽이 끊겨 `paused`가 되면 턴 타임아웃 체크는 자동으로 빠지고 유예(2분)만 남는다:

```js
nextAlarmAt({ graceDeadline, roomExpiresAt, turnDeadline, status }) {
  const candidates = [roomExpiresAt];
  if (graceDeadline != null) candidates.push(graceDeadline);
  if (status === 'playing' && turnDeadline != null) candidates.push(turnDeadline);
  return Math.min(...candidates);
}
```

`alarm()`에 턴 타임아웃 분기를 추가한다 (기존 유예/만료 분기는 그대로 두고 셋을 순서대로 독립 체크 — 하나가 발화해도 나머지는 `rescheduleAlarm()`으로 계속 살아있어야 함):

```js
// 턴 시간 초과
const turnDeadline = r.get('turnDeadline');
if (status === 'playing' && turnDeadline != null && now >= turnDeadline) {
  const nextTurn = r.get('turn') === 'black' ? 'white' : 'black';
  const nextSeq = (r.get('seq') ?? 0) + 1;
  await this.ctx.storage.put({
    turn: nextTurn, seq: nextSeq,
    turnDeadline: now + TURN_TIME_MS,
    lastActivityAt: now,
  });
  this.broadcast({ type: 'timeout', seq: nextSeq, turn: nextTurn });
}
await this.rescheduleAlarm();
```

`seq`를 증가시키는 이유: 실제 착수가 아니어도 상태 전환이므로 기존 `seq` 재동기화 규칙(클라이언트 `seq` 불일치 → `rejected`)이 계속 맞물리게 하기 위함이다.

### 5.2 프로토콜 추가

| 방향 | 타입 | 페이로드 | 시점 |
|---|---|---|---|
| 서버 → 클라이언트 | `timeout` | `{ seq, turn }` | 턴 시간 초과로 서버가 턴을 넘겼을 때 |

### 5.3 클라이언트 (`multiplayer.js`)

`handle()` 스위치에 `'timeout'` 케이스 추가. `'move'` 케이스와 거의 동일하되 `adapter.applyMove`는 부르지 않는다(실제 착수가 없으므로 보드는 그대로, 턴 표시만 바뀜):

```js
case 'timeout':
  session.seq = msg.seq;
  game.currentTurn = msg.turn;
  game.updateUI();
  game.startTimer();
  updateInput(session);
  break;
```

### 5.4 클라이언트 (`script.js`)

`startTimer()`의 온라인 조기 리턴(`if (this.gameMode === 'online') { ...; return; }`)을 제거하고, 대신 온라인일 때는 카운트다운 표시는 그대로 진행하되 0에 도달해도 **로컬에서 턴을 뒤집지 않는다** — 서버의 `timeout`/`move` 메시지가 도착할 때만 턴이 바뀐다:

```js
if (this.timeLeft <= 0) {
    clearInterval(this.timerInterval);
    if (this.gameMode === 'online') return; // 서버 메시지를 기다린다
    this.currentTurn = this.currentTurn === 'black' ? 'white' : 'black';
    // ...기존 로직
}
```

서버가 30초, 클라이언트 표시도 30초라 정상 네트워크 상태에선 거의 동시에 0에 닿는다. 클라 타이머가 서버보다 먼저 0에 닿아도 로컬에서 아무 일도 안 일어나고 그냥 `timeout` 메시지를 기다리므로 어긋나지 않는다.

## 6. 엣지케이스

| 상황 | 처리 |
|---|---|
| 재접속으로 `paused → playing` | `turnDeadline`을 새로 30초로 리셋 (끊기기 전 남은 시간을 승계하지 않음 — 단순함 우선) |
| 타임아웃 브로드캐스트 도중 한쪽이 끊김 | 기존 `webSocketClose`가 별도로 처리, 이번 변경과 무관 |
| `resign`/게임 종료 후 | `status !== 'playing'`이 되므로 알람 후보에서 자동 제외 |

## 7. 테스트 전략

**단위 (Vitest)**: `room.js`에 대해

- 정상 진행 중 30초 경과 → `turn` 반전, `seq` 증가, `timeout` 브로드캐스트
- `paused` 상태에서는 `turnDeadline`이 지나도 아무 일도 안 일어남 (유예만 진행)
- 유예 만료와 턴 타임아웃이 근접한 시각에 겹쳐도 각자 독립적으로 처리됨

**수동**: 브라우저 2개로 온라인 대전 시작 → 한쪽에서 30초간 두지 않음 → 상대 턴으로 넘어가는지, 양쪽 화면 보드/턴 표시가 일치하는지 확인. 나가기 버튼은 로컬 모드 각 게임에서 클릭 → 확인창 → 홈 이동 확인, 모바일 375px에서 레이아웃 확인.

## 8. 구현 단계

| 단계 | 내용 |
|---|---|
| 1 | 나가기 버튼: `lang.js` 키 추가 → 12개 게임 HTML에 버튼 추가 → 모바일 확인 |
| 2 | 온라인 타이머: `room.js` (`turnDeadline`, 알람 3분기, `onMove`/`onRematch`/`onJoin` 갱신) + 단위 테스트 |
| 3 | 온라인 타이머: `multiplayer.js`(`timeout` 케이스) + `script.js`(`startTimer` 온라인 분기) |
| 4 | 두 브라우저로 수동 확인, 전체 테스트 스위트 통과 확인 후 배포 |
