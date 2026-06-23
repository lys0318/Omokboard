# 오목보드 (Omokboard)

> 설치 없이 브라우저에서 바로 즐기는 **무료 온라인 보드게임 9종** — 순수 바닐라 JS로 구현한 정적 웹 서비스

🔗 **Live:** [omokboard.com](https://omokboard.com) · 🇬🇧 [English](https://omokboard.com/en/)

오목·사목·리버시·점잇기·체스·알까기·윷놀이·스도쿠·틱택토 9개 게임을 **각각 AI 대전(난이도 3단계)과 2인 대전**으로 즐길 수 있습니다. 프레임워크·빌드 도구 없이 바닐라 JavaScript만으로 게임 로직, AI, 물리 시뮬레이션, 다국어, SEO까지 직접 구현했습니다.

---

## ✨ 주요 기능

- **게임 9종** — 보드게임마다 독립적인 규칙 엔진과 AI를 자체 구현
- **AI 대전** — 게임별로 쉬움·보통·어려움 3단계, 미니맥스/알파베타 등 직접 작성
- **2인 대전** — 같은 기기에서 번갈아 플레이
- **한국어/영어 다국어** — 클라이언트 토글 + SEO용 별도 영어 URL(`/en/`) + hreflang
- **반응형** — PC·태블릿·모바일, 터치/마우스 모두 지원
- **SEO 최적화** — canonical, hreflang, JSON-LD 구조화 데이터, sitemap, 404 처리
- **무설치** — 정적 사이트, 외부 의존성 최소화(체스 규칙 라이브러리 1개 외 전부 자체 구현)

---

## 🎮 게임별 구현 방식

| 게임 | 렌더링 | AI 핵심 |
|------|--------|---------|
| **오목** (Gomoku) | DOM 그리드 | 알파베타 미니맥스(어려움 4수) + 위협(열린3·4·이중위협) 평가 |
| **사목** (Connect Four 변형) | Canvas | 알파베타 미니맥스 + 윈도우 기반 평가 |
| **리버시** (Othello) | Canvas | 위치 가중치(코너/모서리) + 기동력(mobility) 평가 |
| **점잇기** (Dots & Boxes) | Canvas | 안전수·체인 휴리스틱 |
| **체스** (Chess) | DOM + [chess.js](https://github.com/jhlywa/chess.js) | 미니맥스(어려움 3수) + 기물-위치표(PST) |
| **알까기** (Alkkagi) | Canvas | **커스텀 2D 물리**(마찰·탄성 충돌) + 발사 시뮬레이션 |
| **윷놀이** (Yut Nori) | Canvas | 표준 윷판(지름길·잡기·업기) + 휴리스틱 AI |
| **스도쿠** (Sudoku) | DOM 그리드 | **유일해 보장 생성기**(백트래킹 + 해 개수 검증), 1인·대결 모드 |
| **틱택토** (Tic-Tac-Toe) | DOM | 완전 탐색 미니맥스(무패) |
| **얼티메이트 틱택토** | DOM | 알파베타 미니맥스(어려움 6수) + 보드 전송 전략 평가 |

> 모든 게임 AI는 외부 엔진 없이 직접 작성했고, 핵심 로직(이동 경로·승패·AI 수)은 Node로 단위 검증했습니다.

---

## 🛠 기술 스택

- **언어:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **렌더링:** HTML5 Canvas (물리/보드형 게임), CSS Grid/Flexbox + DOM (격자형 게임)
- **외부 라이브러리:** chess.js (체스 규칙 검증) — 그 외 의존성 없음
- **다국어:** 자체 i18n 스크립트(`lang.js`) + Node 정적 생성기(`build-en.js`)
- **호스팅/배포:** Cloudflare Pages (GitHub 연동 자동 배포, 클린 URL, `_headers` 캐시 제어)
- **분석/수익화:** Google Analytics(gtag), Google AdSense, Kakao AdFit
- **빌드 도구:** 없음 — 정적 파일 직접 서빙 (영어판만 Node 스크립트로 생성)

---

## 📁 프로젝트 구조

```
omokboard/
├── index.html              # 메인 (게임 허브)
├── omok.html / script.js   # 오목 (DOM)
├── connect4.html / .js     # 사목 (Canvas)
├── reversi.html / .js      # 리버시 (Canvas)
├── dots.html / .js         # 점잇기 (Canvas)
├── chess.html / .js        # 체스 (DOM + chess.js)
├── alkkagi.html / .js      # 알까기 (Canvas + 물리)
├── yut.html / .js          # 윷놀이 (Canvas)
├── sudoku.html / .js       # 스도쿠 (생성기 포함)
├── tictactoe.html          # 틱택토 (클래식/얼티메이트 선택)
│   ├── tictactoe.js        #   클래식 3×3
│   └── ultimate.js         #   얼티메이트 (미니맥스)
├── *-guide.html            # 게임별 공략 페이지 (9종)
├── about / contact / privacy.html
├── lang.js                 # 다국어(i18n) 엔진
├── build-en.js             # 영어판 + sitemap 정적 생성기 (Node)
├── style.css / subpage.css # 공통 스타일
├── en/                     # 생성된 영어 페이지 (build-en.js 산출물)
├── sitemap.xml / robots.txt / ads.txt / 404.html / _headers
└── favicon.svg
```

---

## 🌐 다국어 & SEO

- **언어 = URL 기준:** 한국어는 루트(`/omok`), 영어는 `/en/omok`. 언어 토글 시 해당 언어 URL로 이동
- **영어판 자동 생성:** `build-en.js`가 한국어 페이지에서 영어판 23개 + 사이트맵을 생성 → 손으로 중복 관리하지 않음
- **검색 최적화:** 페이지별 canonical·`hreflang`(ko/en/x-default)·Open Graph·JSON-LD(`WebSite`+`ItemList`), 깔끔한 404 처리로 soft-404 방지

```bash
# 콘텐츠 수정 후 영어판/사이트맵 재생성
node build-en.js
```

---

## 🚀 로컬 실행

별도 빌드가 필요 없는 정적 사이트입니다.

```bash
# 아무 정적 서버로 실행 (클린 URL 때문에 file:// 직접 열기보다 서버 권장)
npx serve .
# 또는
python -m http.server
```

> `git push` 시 Cloudflare Pages가 자동 배포합니다.

---

## 💡 구현 하이라이트

- **프레임워크 0** — React 등 없이 9개 게임의 상태 관리·렌더링·입력을 바닐라 JS로 구성
- **게임 AI 직접 설계** — 게임마다 특성에 맞는 알고리즘(알파베타 미니맥스, 위협 평가, 물리 예측, 백트래킹 생성기)을 구현하고 난이도별로 튜닝
- **커스텀 물리 엔진** — 알까기는 속도 벡터·마찰·탄성 충돌을 직접 계산
- **정적 다국어 파이프라인** — 런타임 의존 없이 빌드 타임 생성으로 영어 SEO 페이지 확보
- **운영까지** — 커스텀 도메인, 캐시 버스팅, Search Console/AdSense 연동 등 배포·운영 경험 포함

---

## 📄 라이선스

개인 포트폴리오 프로젝트입니다. 문의: omokboard@gmail.com
