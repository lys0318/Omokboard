# Workers 기반 이전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 정적 사이트를 Cloudflare Pages에서 Workers(static assets)로 이전해, 이후 Durable Object를 같은 프로젝트에 추가할 수 있는 기반을 만든다. 이 계획서 범위에서는 사이트 동작이 **전혀 바뀌지 않아야** 한다.

**Architecture:** 저장소 루트를 그대로 자산 디렉터리로 쓰고, 개발용 파일은 `.assetsignore`로 배포에서 제외한다. 이 단계에서는 Worker 스크립트(`main`)를 두지 않는 assets-only 구성이다. Worker 스크립트는 다음 계획서(오목 온라인 대전)에서 추가한다.

**Tech Stack:** Cloudflare Workers (static assets), Wrangler v4, Node.js

## Global Constraints

- 사이트의 URL 구조·응답 내용은 변경하지 않는다. SEO·AdSense 심사에 영향이 없어야 한다.
- `_headers` 파일은 Workers static assets에서 그대로 지원되므로 유지한다. 내용을 수정하지 않는다.
- 기존 HTML/CSS/JS 파일은 이 계획서에서 **하나도 수정하지 않는다**.
- `docs/`(설계·계획 문서)는 배포 자산에서 제외한다. 공개되면 안 된다.
- 배포(`wrangler deploy`)는 이 계획서에서 실행하지 않는다. AdSense 심사 통과 후 별도로 진행한다.
- **커밋은 하되 원격에 푸시하지 않는다.** 현재 저장소는 Cloudflare Pages Git 연동으로 자동 배포된다. `wrangler.jsonc`가 푸시되면 Pages 빌드가 이 설정을 해석하려 시도해 운영 배포가 흔들릴 수 있다. AdSense 심사 중에는 특히 위험하다. 푸시는 이전을 실제로 실행하는 날 한꺼번에 한다.
- Wrangler는 v4 이상을 사용한다.

---

### Task 1: Workers 자산 구성 추가

**Files:**
- Create: `package.json` (npm init 산출물)
- Create: `wrangler.jsonc`
- Create: `.assetsignore`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음 (최초 작업)
- Produces: `wrangler.jsonc`의 프로젝트 이름 `omokboard`, 자산 디렉터리 `./`. 다음 계획서에서 여기에 `main`과 `durable_objects` 키를 추가한다.

- [ ] **Step 1: npm 프로젝트 초기화 및 wrangler 설치**

저장소 루트에서 실행:

```bash
npm init -y
npm install --save-dev wrangler@^4.0.0
```

- [ ] **Step 2: wrangler 버전 확인**

Run: `npx wrangler --version`
Expected: `4.` 로 시작하는 버전 문자열이 출력된다. 3.x가 나오면 Step 1의 설치가 실패한 것이므로 다시 실행한다.

- [ ] **Step 3: `wrangler.jsonc` 작성**

`wrangler.jsonc` 파일을 아래 내용으로 생성한다.

```jsonc
{
  "name": "omokboard",
  "compatibility_date": "2026-07-20",
  "assets": {
    "directory": "./",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

`main` 키는 넣지 않는다. 이 단계는 assets-only 구성이다.

두 옵션의 이유:

- `html_handling: "auto-trailing-slash"` — 현재 사이트 URL은 `/omok`처럼 확장자가 없고 Pages가 `omok.html`로 매핑해 왔다. 이 값이 같은 매핑을 담당한다. (기본값이지만 파리티가 걸린 설정이라 명시한다)
- `not_found_handling: "404-page"` — 저장소에 `404.html`이 있고 Pages는 이를 자동으로 서빙했다. Workers는 이 옵션이 없으면 밋밋한 404를 반환하므로 명시해야 파리티가 유지된다.

- [ ] **Step 4: `.assetsignore` 작성**

저장소 루트를 자산 디렉터리로 쓰므로, 배포되면 안 되는 파일을 제외한다. `.assetsignore` 파일을 아래 내용으로 생성한다. (gitignore와 같은 패턴 문법)

```
.git
.github
.claude
.agents
node_modules
docs
scripts
package.json
package-lock.json
wrangler.jsonc
.assetsignore
build-en.js
skills-lock.json
README.md
.gitignore
```

- [ ] **Step 5: `.gitignore`에 node_modules 추가**

`.gitignore` 파일 맨 아래에 다음 두 줄을 추가한다.

```
# Node
node_modules/
```

- [ ] **Step 6: 설정 유효성 검증**

Run: `npx wrangler deploy --dry-run`
Expected: 오류 없이 완료되고, 업로드 예정 자산 개수가 출력된다. 실제 배포는 일어나지 않는다.

오류가 나면 `wrangler.jsonc`의 JSON 문법과 `compatibility_date` 형식을 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json wrangler.jsonc .assetsignore .gitignore
git commit -m "build: Workers static assets 구성 추가 (배포 전환 없음)"
```

---

### Task 2: 스모크 체크 스크립트

**Files:**
- Create: `scripts/smoke.mjs`
- Modify: `package.json` (scripts 항목 추가)

**Interfaces:**
- Consumes: Task 1의 `wrangler.jsonc` (로컬 서버가 자산을 서빙해야 함)
- Produces: `npm run smoke -- <baseUrl>` 명령. 인자로 받은 베이스 URL에 대해 핵심 경로의 상태 코드와 본문 일부를 검증한다. Phase 6 배포 검증에서도 재사용한다.

- [ ] **Step 1: 실패하는 스모크 스크립트 작성**

`scripts/smoke.mjs` 파일을 아래 내용으로 생성한다.

```js
// 배포/로컬 서버가 핵심 경로를 올바르게 서빙하는지 확인한다.
// 사용: node scripts/smoke.mjs http://localhost:8787
const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/smoke.mjs <baseUrl>');
  process.exit(2);
}

// [경로, 응답 본문에 반드시 포함되어야 하는 문자열]
const CHECKS = [
  ['/',                    '오목보드'],
  ['/omok',                '오목 게임'],
  ['/chess',               '체스'],
  ['/free-board-games',    '무료 온라인 보드게임'],
  ['/en/omok',             'Omok'],
  ['/en/',                 'Omokboard'],
  ['/style.css',           'focus-visible'],
  ['/analytics.js',        'game_started'],
  ['/sitemap.xml',         '<urlset'],
  ['/robots.txt',          'Sitemap:'],
  ['/llms.txt',            '오목보드'],
  ['/og/omok.png',         null],
];

let failed = 0;
for (const [path, needle] of CHECKS) {
  const url = base.replace(/\/$/, '') + path;
  try {
    const res = await fetch(url);
    if (res.status !== 200) {
      console.error(`FAIL ${path} -> status ${res.status}`);
      failed++;
      continue;
    }
    if (needle !== null) {
      const body = await res.text();
      if (!body.includes(needle)) {
        console.error(`FAIL ${path} -> body missing ${JSON.stringify(needle)}`);
        failed++;
        continue;
      }
    }
    console.log(`ok   ${path}`);
  } catch (err) {
    console.error(`FAIL ${path} -> ${err.message}`);
    failed++;
  }
}

// 배포되면 안 되는 경로는 200이 아니어야 한다
const MUST_NOT_SERVE = ['/wrangler.jsonc', '/package.json', '/build-en.js', '/docs/superpowers/plans/2026-07-20-workers-migration.md'];
for (const path of MUST_NOT_SERVE) {
  const url = base.replace(/\/$/, '') + path;
  try {
    const res = await fetch(url);
    if (res.status === 200) {
      console.error(`FAIL ${path} -> 배포되면 안 되는 파일이 200으로 서빙됨`);
      failed++;
    } else {
      console.log(`ok   ${path} (차단됨: ${res.status})`);
    }
  } catch {
    console.log(`ok   ${path} (요청 실패 = 미서빙)`);
  }
}

// 없는 경로는 커스텀 404.html을 반환해야 한다 (Pages 파리티)
{
  const url = base.replace(/\/$/, '') + '/this-path-does-not-exist-xyz';
  const res = await fetch(url);
  const body = await res.text();
  if (res.status === 404 && body.includes('페이지를 찾을 수 없습니다')) {
    console.log('ok   없는 경로 -> 커스텀 404');
  } else {
    console.error(`FAIL 없는 경로 -> status ${res.status}, 커스텀 404.html 아님`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed}개 실패`);
  process.exit(1);
}
console.log('\n전부 통과');
```

- [ ] **Step 2: package.json에 스크립트 추가**

`package.json`의 `"scripts"` 객체에 아래 두 항목을 추가한다.

```json
"scripts": {
  "dev": "wrangler dev",
  "smoke": "node scripts/smoke.mjs"
}
```

- [ ] **Step 3: 로컬 서버 없이 실행해 실패를 확인**

Run: `npm run smoke -- http://localhost:8787`
Expected: 서버가 안 떠 있으므로 모든 경로가 `FAIL ... fetch failed` 로 출력되고 종료 코드 1로 끝난다. 스크립트 자체는 정상 동작한다는 뜻이다.

- [ ] **Step 4: 로컬 Workers 서버 기동**

별도 터미널에서 실행:

```bash
npx wrangler dev
```

Expected: 로컬 서버가 기동되고 `http://localhost:8787` 주소가 출력된다. 포트가 다르면 다음 단계에서 그 포트를 사용한다.

- [ ] **Step 5: 스모크 체크 통과 확인**

Run: `npm run smoke -- http://localhost:8787`
Expected: 모든 줄이 `ok` 로 출력되고 마지막에 `전부 통과`. 종료 코드 0.

실패 유형별 대응:

- `/omok`, `/chess` 등 **확장자 없는 경로가 404** — 이 이전 작업에서 가장 위험한 실패다. 사이트 전 URL이 깨진다는 뜻이므로 여기서 반드시 잡아야 한다. `wrangler.jsonc`의 `html_handling`이 `"auto-trailing-slash"`인지 확인한다. 그래도 안 되면 자산 디렉터리 설정(`directory: "./"`)이 루트를 제대로 가리키는지 확인한다. **이 항목이 통과하지 못하면 이전을 진행하지 않는다.**
- `/wrangler.jsonc` 등이 200으로 서빙됨 — `.assetsignore`가 적용되지 않은 것이므로 Task 1 Step 4를 다시 확인한다.
- `/없는경로`가 커스텀 404를 반환하지 않음 — `not_found_handling: "404-page"` 설정을 확인한다.

- [ ] **Step 6: 브라우저로 육안 확인**

브라우저에서 `http://localhost:8787` 을 연다. 확인 항목:

- 게임 카드 12개가 보인다
- 오목 카드를 눌러 게임에 들어가 돌을 한 수 둘 수 있다
- 언어 토글(EN)이 동작한다

하나라도 실패하면 이전 단계 설정을 재검토한다.

- [ ] **Step 7: 커밋**

```bash
git add scripts/smoke.mjs package.json
git commit -m "test: 배포 검증용 스모크 체크 스크립트 추가"
```

---

## 완료 기준

- `npx wrangler dev` 로 띄운 사이트가 현재 프로덕션과 동일하게 동작한다
- `npm run smoke -- http://localhost:8787` 이 전부 통과한다
- `docs/`, `wrangler.jsonc`, `package.json` 등 개발 파일이 서빙되지 않는다
- 기존 HTML/CSS/JS 파일이 하나도 수정되지 않았다 (`git diff --stat` 으로 확인)
- **배포는 하지 않는다.** AdSense 심사 통과 후 별도 진행한다.

## 다음 계획서

`docs/superpowers/plans/`에 이어서 작성할 것:

- 오목 온라인 대전 (스펙 1~4단계) — Worker 스크립트 + Durable Object + 어댑터 + UI
- 나머지 5종 어댑터 (스펙 5단계)
