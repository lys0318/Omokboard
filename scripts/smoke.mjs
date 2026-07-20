// 배포/로컬 서버가 핵심 경로를 올바르게 서빙하는지 확인한다.
// 사용: node scripts/smoke.mjs http://localhost:8787
const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/smoke.mjs <baseUrl>');
  process.exit(2);
}
const root = base.replace(/\/$/, '');

// [경로, 응답 본문에 반드시 포함되어야 하는 문자열]
const CHECKS = [
  ['/',                    '오목보드'],
  ['/omok',                '오목 게임'],
  ['/chess',               '체스'],
  ['/free-board-games',    '무료 온라인 보드게임'],
  ['/ladder-uses',         '사다리타기 활용법'],
  ['/korean-games',        '한국 전통 놀이'],
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
  try {
    const res = await fetch(root + path);
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
const MUST_NOT_SERVE = [
  '/wrangler.jsonc',
  '/package.json',
  '/build-en.js',
  '/docs/superpowers/plans/2026-07-20-workers-migration.md',
];
for (const path of MUST_NOT_SERVE) {
  try {
    const res = await fetch(root + path);
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
try {
  const res = await fetch(root + '/this-path-does-not-exist-xyz');
  const body = await res.text();
  if (res.status === 404 && body.includes('페이지를 찾을 수 없습니다')) {
    console.log('ok   없는 경로 -> 커스텀 404');
  } else {
    console.error(`FAIL 없는 경로 -> status ${res.status}, 커스텀 404.html 아님`);
    failed++;
  }
} catch (err) {
  console.error(`FAIL 없는 경로 -> ${err.message}`);
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed}개 실패`);
  process.exit(1);
}
console.log('\n전부 통과');
