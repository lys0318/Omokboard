# 온라인 방 대전 설계 (Multiplayer Rooms)

작성일: 2026-07-20
상태: 승인됨 (구현 전)

## 1. 목표

사용자가 방을 만들고, 상대가 방 코드(또는 공유 링크)로 들어와 실시간으로 대결하는 기능을 오목보드에 추가한다.

현재 사이트는 순수 정적(Cloudflare Pages, `wrangler.toml`·`package.json` 없음)이며 모든 게임이 클라이언트 전용(AI 대전 / 한 화면 2인)이다. 이 설계는 기존 게임 로직을 최대한 보존하면서 실시간 대전 계층을 얹는다.

## 2. 확정 요구사항

| 항목 | 결정 |
|---|---|
| 지속성 | 재접속 복구까지. 전적·랭킹은 저장하지 않음 |
| 대상 게임 | 턴제 6종 — 오목, 사목, 리버시, 점잇기, 체스, 틱택토 |
| 서버 권위 | 경량 검증 (턴 순서, 칸 점유, 방 인원). 게임 규칙 전체 검증은 하지 않음 |
| 이탈 정책 | 관대 — 재접속 유예 2분, 방 유지 30분(마지막 활동 기준) |
| 통합 방식 | A안: 어댑터 계층 (기존 게임 로직 비침습) |

## 3. 비목표 (YAGNI)

이번 범위에서 명시적으로 제외한다.

- 랜덤 매칭 (코드·링크 공유만)
- 관전 모드
- 채팅 (XSS·신고 처리 부담)
- 전적·랭킹·계정 (별도 DB가 필요해짐)
- 완전 서버 권위 (게임 규칙 서버 재구현)
- 1인용 게임(스도쿠·지뢰찾기·2048), 사다리타기, 알까기(물리 연산), 윷놀이(난수 권위 필요)

## 4. 기술 스택 결정

- **서버**: Cloudflare Worker — 정적 자산 서빙 + API 라우팅을 한 프로젝트에서 처리
- **실시간·상태**: Durable Object (SQLite 백엔드), 방 1개 = DO 인스턴스 1개
- **데이터베이스**: 사용하지 않음. 남길 데이터가 없고 방 상태는 DO 자체 스토리지로 충분하다
- **비용**: Workers 무료 플랜에서 시작 가능. SQLite 백엔드 DO는 무료 플랜에서 지원되며 스토리지 과금이 없다 (한도 초과 시 해당 작업이 실패한다)

D1은 전적·랭킹을 도입할 때 추가한다. 지금 넣으면 쓰지 않는 테이블만 생긴다.

### Pages → Workers 이전이 필요한 이유

Cloudflare Pages 프로젝트 안에서는 Durable Object를 정의·배포할 수 없다. Pages를 유지하려면 DO 전용 Worker를 따로 만들어 바인딩해야 하므로 배포 대상이 둘로 늘어난다. Workers(static assets)로 통합하면 배포가 하나로 유지된다.

`_headers`·`_redirects`는 Workers static assets에서 그대로 지원되므로 현재 캐시 설정은 이전 후에도 유효하다.

## 5. 아키텍처

```
[브라우저]
  omok.html + script.js            기존 게임 로직 (변경 최소)
      |
      +-- multiplayer.js           공용: 방·WebSocket·재접속·재연결 백오프
      +-- adapters/omok.js         게임별: 직렬화·복원·수 적용
      |
      | WebSocket
      v
[Cloudflare Worker]                정적 자산 + API 라우팅
  /api/room            POST        방 생성
  /api/room/:code      WS upgrade  방 접속
      |
      v
[Durable Object]  = 방 1개
  - 접속자 2명 관리 (WebSocket Hibernation)
  - 상태 저장 (재접속용)
  - 경량 검증 (턴·칸·인원)
  - 알람 1개로 유예/만료 관리
```

핵심 성질:

- 방 코드가 곧 DO 이름이다 (`idFromName("K7RM92")`). 방 목록을 저장할 별도 저장소가 필요 없다.
- DO가 유일한 상태 보관소다.
- 기존 게임 페이지의 AI·2인 로컬 모드는 그대로 유지되고, 온라인 대전이 모드로 추가된다.

## 6. 방 코드와 입장 흐름

### 방 코드

- 6자리, 대문자 + 숫자, 혼동 문자(`0 O 1 I L`) 제외. 예: `K7RM92`
- **서버가 생성한다.** 클라이언트가 생성하면 기존 방 코드와 충돌해 남의 방에 난입할 수 있다.
- 충돌 시 서버가 다른 코드로 재시도한다.

### 흐름

```
방장 A
 1. 게임 페이지 → "온라인 대전" → "방 만들기"
 2. POST /api/room  { gameId }
 3. 서버: 코드 생성 → 해당 DO 초기화 시도 (이미 사용 중이면 재시도)
 4. 응답 { code, token, color: 'black' }
 5. 화면: 코드 + 공유 링크 표시, "상대 기다리는 중"

참가자 B
 6. 코드 입력 또는 공유 링크 클릭
 7. WS 연결 → 서버가 빈 자리 확인
 8. 응답 { token, color: 'white' }
 9. 2명이 차면 양쪽에 게임 시작 통지

제3자 C
 10. 같은 코드로 접속 → 자리 없음 → ROOM_FULL 거부
```

### 공유 링크

```
https://omokboard.com/omok?room=K7RM92
```

메신저로 이 링크를 보내면 상대는 클릭 한 번으로 입장한다. 코드 입력창은 링크를 쓸 수 없는 상황을 위한 대안으로 유지한다.

### 좌석 라벨(`color`)

프로토콜에서 쓰는 `color`는 **좌석 구분자**이며 값은 항상 `'black' | 'white'` 두 개다. 방장이 `black`, 참가자가 `white`이고 `black`이 선공이다.

색 개념이 없는 게임(사목·점잇기 등)에서는 어댑터가 이 라벨을 자기 표현으로 매핑한다(예: 사목 `black` → 빨강, 점잇기 `black` → 플레이어 1). DO는 라벨만 다루고 표현은 알지 못한다.

### 플레이어 토큰

익명 사용자이므로 "내가 아까 그 흑돌"임을 증명할 수단이 필요하다.

- 입장 시 서버가 랜덤 토큰을 발급하고 클라이언트는 `localStorage`에 저장한다.
- 재접속 시 토큰을 함께 보내면 DO가 매칭해 원래 자리로 복귀시키고 현재 상태를 전송한다.
- 토큰이 없는 사람은 코드를 알아도 **빈 자리에만** 들어갈 수 있다. 자리 뺏기가 방지된다.
- 토큰은 해당 방에서만 유효하며 방이 소멸하면 함께 사라진다. 계정이 아니다.

### 방 상태

```
waiting   1명, 상대 대기 중
playing   2명, 대전 중
paused    한쪽 끊김, 유예 2분 카운트다운
finished  승부 결정 또는 유예 초과
```

## 7. WebSocket 프로토콜

메시지는 JSON이다.

### 클라이언트 → 서버

| 타입 | 페이로드 | 시점 |
|---|---|---|
| `join` | `{ token? }` | 연결 직후. 토큰이 있으면 재접속 |
| `move` | `{ move, seq }` | 로컬에서 수를 둔 직후 |
| `resign` | — | 항복 |
| `rematch` | — | 종료 후 같은 방에서 재대결 |

### 서버 → 클라이언트

| 타입 | 페이로드 | 시점 |
|---|---|---|
| `joined` | `{ color, status, state, seq }` | 입장·재접속 성공 |
| `move` | `{ move, seq, turn }` | 검증을 통과한 상대 수 |
| `rejected` | `{ reason, state, seq }` | 검증 실패. 전체 상태를 동봉해 강제 재동기화 |
| `opponent` | `{ event: 'joined' \| 'left' \| 'reconnected' }` | 상대 상태 변화 |
| `status` | `{ status, endsAt? }` | paused(유예 마감 시각 포함)·finished |
| `error` | `{ code, message }` | ROOM_FULL, ROOM_NOT_FOUND 등 |

### seq 기반 재동기화

모든 수에 증가하는 순번을 붙이고 DO가 권위를 가진다.

```
클라이언트 seq != 서버 seq  →  rejected + 전체 state 전송  →  클라이언트가 통째로 복원
```

경량 검증만 하므로 규칙 위반 자체는 막지 못하지만, 화면이 어긋나면 자동으로 맞춰진다. A안에서 desync를 감당하는 방법이다.

## 8. DO 저장 구조와 검증 정책

```js
{
  gameId: 'omok',
  initialized: true,
  state: <어댑터가 만든 불투명 상태>,   // DO는 내용을 해석하지 않음
  turn: 'black' | 'white',
  seq: 42,
  occupied: Set,                        // 칸 점유 검증용 (선언한 게임만)
  players: {
    black: { token, connected },
    white: { token, connected }
  },
  lastActivityAt, graceDeadline?
}
```

검증은 게임에 무관하게 수행한다.

- **턴**: 보낸 사람이 현재 턴인지 — 전 게임 공통
- **칸 점유**: 어댑터가 `serverChecks`에 `emptyCell`을 선언한 게임만 (오목·사목·틱택토·점잇기)
- 체스·리버시는 `['turn']`만 적용한다. 도착 칸에 기물이 있어도 합법이므로 점유 검증이 맞지 않는다.

이 구조 덕분에 게임을 추가해도 DO 코드는 수정하지 않는다.

## 9. 어댑터 인터페이스

```js
// adapters/omok.js
export default {
  id: 'omok',
  serverChecks: ['turn', 'emptyCell'],

  serialize(game)           { return { board: game.board, turn: game.currentTurn }; },
  restore(game, state)      { game.board = state.board; game.currentTurn = state.turn; game.render(); },
  applyMove(game, move)     { game.placeStone(move.row, move.col, { remote: true }); },
  onLocalMove(game, cb)     { game.hooks.afterMove = m => cb({ row: m.row, col: m.col, cell: `${m.row},${m.col}` }); },
  setInputEnabled(game, on) { game.inputLocked = !on; }
};
```

게임당 이 6개만 채우면 된다.

### 기존 코드 변경 범위 (오목 기준)

`script.js`에 추가할 것:

- `afterMove` 훅 호출 (수가 확정된 지점)
- `inputLocked` 검사 (내 차례가 아닐 때 입력 차단)
- `placeStone(..., { remote })` — 원격 수는 서버로 되쏘지 않도록 구분

AI·2인 로컬 모드의 동작은 바뀌지 않는다.

## 10. 엣지케이스

### 끊김 → 유예 → 종료

```
WS close 감지
  → player.connected = false, status = 'paused'
  → 상대에게 opponent{left} + status{paused, endsAt}
  → 알람 2분 설정

유예 안에 토큰으로 재접속
  → connected = true, status = 'playing', 유예 해제
  → 양쪽에 opponent{reconnected} + 현재 state

유예 초과 (알람 발화)
  → status = 'finished', 남은 사람 승리 처리
```

클라이언트 재연결 백오프: 1초 → 2초 → 4초 → 8초 → 최대 15초 간격, 유예 2분까지만 시도한다.

### 함정 1 — DO 알람은 하나뿐

유예(2분)와 방 만료(30분)를 동시에 걸 수 없다. 알람은 DO당 하나다.

가장 이른 시각으로 하나만 설정하고, 발화 시 상태로 이유를 판단한다.

```js
nextAlarm = min(graceDeadline ?? Infinity, roomExpiresAt)
// 발화 시:
//   status === 'paused' && now >= graceDeadline  → 유예 종료 처리
//   그 외                                        → 방 만료 정리
```

이 처리를 빠뜨리면 유예 알람이 만료 알람을 덮어써서 방이 정리되지 않는다.

### 함정 2 — DO는 "없는 방"이 없다

`idFromName()`은 어떤 문자열에 대해서도 DO를 만들어낸다. 존재 검사 개념이 없다.

DO 내부에 `initialized` 플래그를 둔다.

```
join 요청 시 initialized === false
  → error{ ROOM_NOT_FOUND } 반환 + 스토리지 정리
```

빠뜨리면 오타 친 코드마다 빈 방이 쌓인다.

### 그 외

| 상황 | 처리 |
|---|---|
| 3번째 접속 | `ROOM_FULL` — "이미 2명이 대전 중" 안내 |
| 없는/오타 코드 | `ROOM_NOT_FOUND` — 코드 재입력 유도 |
| 같은 토큰 두 탭 | 나중 연결이 이기고 기존 소켓을 닫는다 (모바일 새로고침 대응) |
| 명시적 "나가기" | 유예 없이 즉시 종료 (브라우저 닫기와 구분) |
| 상대가 안 들어옴 | `waiting` 유지, 방 만료(30분)까지 코드·공유 링크 표시 |
| 게임 종료 후 | `rematch` — 같은 방 재사용, 흑백 교대 |

## 11. 비용·한도

- **WebSocket Hibernation**(`state.acceptWebSocket()`)을 사용한다. 유휴 시 DO 메모리가 해제되고 WebSocket은 유지되어 duration 과금을 크게 줄인다. 턴제라 대기 시간이 대부분이므로 효과가 크다.
- 무료 플랜 한도를 초과하면 해당 작업이 실패한다. 이 경우 "온라인 대전 일시 불가, AI 대전은 정상" 폴백 안내를 노출하고 대시보드 사용량을 모니터링한다.

## 12. 보안

- 방 코드는 추측 가능하므로 **토큰이 자리 소유권을 증명**한다. 코드만으로는 빈 자리에만 들어갈 수 있다.
- 메시지 크기와 전송 빈도를 제한해 수 스팸을 방지한다.
- 사용자 입력 텍스트가 없으므로(채팅 제외) XSS 표면이 없다.

## 13. 테스트 전략

Workers 이전 시 들어오는 `package.json`에 최소한의 테스트만 함께 넣는다.

**단위 (Vitest + `@cloudflare/vitest-pool-workers`)** — DO 로직 대상:

- 경량 검증: 남의 턴 거부, 이미 찬 칸 거부, 3번째 입장 거부
- `seq` 불일치 시 `rejected` + state 동봉
- 알람 분기: 유예 마감과 방 만료가 겹칠 때 올바른 처리 선택 (함정 1)
- `initialized === false`인 DO에 join → `ROOM_NOT_FOUND` + 정리 (함정 2)
- 토큰 매칭 재접속 시 원래 색 복귀

**통합** — WebSocket 클라이언트 2개로 전체 시나리오:

```
방 생성 → 입장 → 수 3회 교환 → A 끊김 → 유예 중 재접속 → 계속 → 승부 → rematch
```

**수동** — 실기기 2대(폰 + PC)로 실제 대전. 모바일 화면 꺼짐 후 복귀가 핵심 확인 항목이다.

테스트하지 않을 것: 게임 규칙 자체(기존 코드, 이번 변경 대상 아님), 정적 페이지.

## 14. 구현 단계

각 단계는 독립적으로 확인 가능하다.

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0. 기반 | `package.json` + `wrangler.jsonc`, Workers static assets로 기존 사이트 구동 | 로컬에서 12종 게임이 현재와 동일하게 동작 |
| 1. DO 뼈대 | 방 생성·입장·토큰·WS 연결 (게임 로직 없음) | 두 브라우저가 같은 코드로 접속해 2명 참 |
| 2. 오목 어댑터 | 수 교환 + 경량 검증 + seq 재동기화 | 두 브라우저에서 오목 한 판 완주 |
| 3. 복원력 | 끊김·재접속·유예·방 만료 알람 | 새로고침해도 판 유지, 유예 초과 시 종료 |
| 4. UI | 방 만들기·코드 입력·공유 링크·상태 표시 | 폰에서 링크 클릭 한 번으로 입장 |
| 5. 확장 | 나머지 5종 어댑터 | 사목·리버시·점잇기·체스·틱택토 대전 |
| 6. 배포 | Workers 이전 배포 → 확인 → 멀티플레이 공개 | 정적 사이트 이상 없음 확인 후 기능 오픈 |

## 15. 배포 순서

AdSense 심사가 진행 중이므로 배포 방식 변경은 심사 통과 이후로 미룬다. 개발은 `wrangler dev`로 로컬에서 진행하므로 심사를 기다릴 필요가 없다.

```
지금        로컬에서 0~5단계 개발·테스트
심사 통과   ① Workers 이전만 배포 → 정적 사이트 정상 확인
           ② 멀티플레이 공개
```

플랫폼 이전과 신규 실시간 기능을 한 배포에 묶지 않는다. 문제가 생겼을 때 원인을 구분할 수 없기 때문이다.
