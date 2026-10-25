// 숫자야구 규칙·AI 점검: 경우의 수, 입력 검사, 판정, 서버 판정과의 일치, AI가 규칙대로 부르고 결국 맞히는지.
// 실행: node scripts/baseball-ai-check.mjs [판 수]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as server from '../worker/baseball.mjs';

const src = readFileSync(new URL('../number-baseball.js', import.meta.url), 'utf8')
  .replace(/window\.\w+\s*=\s*new \w+\(\);?/g, ''); // DOM 없이 규칙·AI만 꺼낸다
const ctx = vm.createContext({ Math, console });
vm.runInContext(src + '\nglobalThis.Core = BaseballCore;', ctx);
const { Core } = ctx;

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.error('FAIL', msg); } };

// 1) 경우의 수: 1~9 중 서로 다른 숫자
check(Core.allCodes(3).length === 504, `3자리 경우의 수 ${Core.allCodes(3).length} (기대 504)`);
check(Core.allCodes(4).length === 3024, `4자리 경우의 수 ${Core.allCodes(4).length} (기대 3024)`);

// 2) 입력 검사
for (const [s, n, ok] of [['123', 3, true], ['987', 3, true], ['112', 3, false], ['103', 3, false], ['12', 3, false],
  ['1234', 3, false], ['1234', 4, true], ['12a', 3, false], [123, 3, false]]) {
  check(Core.isValid(s, n) === ok, `isValid(${JSON.stringify(s)}, ${n}) !== ${ok}`);
  check(server.isValid(s, n) === ok, `server.isValid(${JSON.stringify(s)}, ${n}) !== ${ok}`);
}

// 3) 판정 예시 + 서버와 판정 일치 (3자리 모든 쌍)
const r = Core.score('381', '318');
check(r.strikes === 1 && r.balls === 2, `381 vs 318 → ${r.strikes}S ${r.balls}B (기대 1S 2B)`);
let mismatch = 0;
for (const a of Core.allCodes(3)) for (const b of Core.allCodes(3)) {
  const x = Core.score(a, b), y = server.score(a, b);
  if (x.strikes !== y.strikes || x.balls !== y.balls) mismatch++;
}
check(mismatch === 0, `클라이언트·서버 판정 불일치 ${mismatch}건`);

// 4) AI: 규칙에 맞는 숫자만, 같은 숫자 반복 없이, 결국 맞힌다
const n = Number(process.argv[2]) || 200;
for (const digits of [3, 4]) {
  for (const level of ['easy', 'normal', 'hard']) {
    const games = digits === 4 && level === 'hard' ? Math.min(n, 50) : n;
    let total = 0, worst = 0;
    for (let g = 0; g < games; g++) {
      const secret = Core.randomCode(digits);
      const history = [];
      for (let turn = 1; ; turn++) {
        const guess = Core.aiGuess(level, digits, history);
        if (!Core.isValid(guess, digits)) { check(false, `${level} ${digits}자리: 규칙 위반 ${guess}`); break; }
        if (history.some((h) => h.guess === guess)) { check(false, `${level} ${digits}자리: 반복 ${guess}`); break; }
        const res = Core.score(secret, guess);
        history.push({ guess, ...res });
        if (res.strikes === digits) { total += turn; worst = Math.max(worst, turn); break; }
        if (turn > Core.allCodes(digits).length) { check(false, `${level} ${digits}자리: 끝나지 않음`); break; }
      }
    }
    console.log(`${digits}자리 ${level.padEnd(6)} 평균 ${(total / games).toFixed(2)}번, 최대 ${worst}번 (${games}판)`);
  }
}

if (failed) { console.error(`${failed}개 실패`); process.exit(1); }
console.log('OK');
