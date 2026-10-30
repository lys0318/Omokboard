// 딱지치기 판정식·AI 점검: 세기가 셀수록 확률이 오르는지, 들뜬 변 쪽 가장자리 바로 안쪽이 가장 높고 나머지 세 변은 0.65배인지,
// 0~92% 범위, 같은 입력이면 같은 결과, AI가 범위 밖 값을 내지 않고 난이도별 성공률이 목표 근처인지,
// 서버 입력 검사와 클라이언트 검사가 같은지.
// 실행: node scripts/ttakji-check.mjs [시행 수]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as server from '../worker/ttakji.mjs';

const src = readFileSync(new URL('../ttakji.js', import.meta.url), 'utf8')
  .replace(/window\.\w+\s*=\s*new \w+\(\);?/g, ''); // DOM 없이 판정식·AI만 꺼낸다
const ctx = vm.createContext({ Math, console });
vm.runInContext(src + '\nglobalThis.Core = TtakjiCore;', ctx);
const { Core } = ctx;
const { BOARD, CENTER, TILE } = Core;

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.error('FAIL', msg); } };

// 바닥 딱지 기준 (u, v) → 판 좌표
const at = (k, u, v) => {
  const t = Core.tileAngle(k) * Math.PI / 180;
  return [CENTER + u * Math.cos(t) - v * Math.sin(t), CENTER + u * Math.sin(t) + v * Math.cos(t)];
};
const h = TILE / 2;

// 1) 범위와 세기 단조성
for (let i = 0; i < 2000; i++) {
  const k = i % 13, [x, y] = at(k, (Math.random() * 4 - 2) * h, (Math.random() * 4 - 2) * h);
  let prev = -1;
  for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const c = Core.flipChance(k, x, y, p);
    check(c >= 0 && c <= 0.92 + 1e-9, `범위 밖 확률 ${c}`);
    check(c >= prev - 1e-12, `세기가 셀수록 확률이 낮아짐 (k=${k}, p=${p})`);
    prev = c;
  }
}

// 2) 위치: 들뜬 변 쪽 가장자리 바로 안쪽(0.85~1)이 가장 높고, 가운데·멀리는 낮다
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const onSide = (k, s, m, along = 0) => at(k, SIDES[s][0] * m * h - SIDES[s][1] * along * h, SIDES[s][1] * m * h + SIDES[s][0] * along * h);
for (let k = 0; k < 14; k++) {
  const lift = Core.liftSide(k);
  let bestM = 0, best = -1;
  for (let m = 0; m <= 1.8; m += 0.01) {
    const c = Core.flipChance(k, ...onSide(k, lift, m), 1);
    if (c > best) { best = c; bestM = m; }
  }
  check(bestM >= 0.84 && bestM <= 1.01, `k=${k} 가장 잘 뒤집히는 위치 m=${bestM.toFixed(2)} (기대 0.85~1)`);
  check(Math.abs(best - 0.92) < 1e-9, `k=${k} 들뜬 변 최고 확률 ${best}`);
  // 3) 나머지 세 변은 같은 자리라도 0.65배 (대각선 근처 경계는 피해서 along 0.5 이내)
  for (let s = 0; s < 4; s++) {
    if (s === lift) continue;
    for (const [m, along] of [[0.92, 0], [0.92, 0.5], [1.15, -0.4], [0.5, 0.2]]) {
      const ratio = Core.flipChance(k, ...onSide(k, s, m, along), 1) / Core.flipChance(k, ...onSide(k, lift, m, along), 1);
      check(Math.abs(ratio - Core.OTHER_SIDE) < 1e-9, `k=${k} 변 ${s} 비율 ${ratio} (기대 ${Core.OTHER_SIDE})`);
    }
  }
}
check(Core.flipChance(3, ...at(3, 0, 0), 1) < 0.15, '한가운데 확률이 너무 높음');
check(Core.flipChance(3, ...onSide(3, Core.liftSide(3), 1.7), 1) === 0, '멀리 친 헛손질이 0이 아님');

// 4) 같은 입력이면 같은 결과 (온라인 양쪽 판정 일치)
for (let i = 0; i < 500; i++) {
  const k = i % 7, x = Math.random() * BOARD, y = Math.random() * BOARD, p = Math.random(), r = Math.random();
  check(Core.resolve(k, x, y, p, r) === Core.resolve(k, x, y, p, r), '같은 입력에 다른 결과');
  check(Core.resolve(k, x, y, p, r) === (r < Core.flipChance(k, x, y, p)), 'resolve와 flipChance 불일치');
}

// 5) 입력 검사: 클라이언트와 서버가 같다
for (const [x, y, p, ok] of [[200, 200, 0.5, true], [0, 0, 0, true], [BOARD, BOARD, 1, true], [-1, 200, 0.5, false],
  [200, BOARD + 1, 0.5, false], [200, 200, 1.01, false], [200, 200, -0.1, false], ['200', 200, 0.5, false], [NaN, 200, 0.5, false]]) {
  check(Core.isValidShot(x, y, p) === ok, `isValidShot(${x}, ${y}, ${p}) !== ${ok}`);
  check(server.isValidShot(x, y, p) === ok, `server.isValidShot(${x}, ${y}, ${p}) !== ${ok}`);
}

// 6) AI: 범위 안 값만, 난이도별 성공률(기댓값)이 목표 ±5%p
const n = Number(process.argv[2]) || 20000;
const target = { easy: 0.25, normal: 0.5, hard: 0.75 };
for (const level of ['easy', 'normal', 'hard']) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const k = i % 10, s = Core.aiShot(level, k);
    if (!Core.isValidShot(s.x, s.y, s.power)) { check(false, `${level}: 범위 밖 ${JSON.stringify(s)}`); break; }
    sum += Core.flipChance(k, s.x, s.y, s.power);
  }
  const rate = sum / n;
  console.log(`${level.padEnd(6)} 성공률(기댓값) ${(rate * 100).toFixed(1)}%  (${n}번)`);
  check(Math.abs(rate - target[level]) <= 0.05, `${level} 성공률 ${(rate * 100).toFixed(1)}%가 목표 ${target[level] * 100}%에서 벗어남`);
}

if (failed) { console.error(`${failed}개 실패`); process.exit(1); }
console.log('OK');
