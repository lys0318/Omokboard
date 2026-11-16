// 혼자 하는 게임 4종의 실측: 게임 파일의 로직을 그대로 불러와(DOM 없이) 잰다.
// 스도쿠 실제 힌트 수, 지뢰찾기 첫 클릭에 열리는 칸, 2048 전략별 최고 타일, 사다리타기 도착 분포.
// 실행: node scripts/solo-stats.mjs [sudoku|mine|2048|ladder ...]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const load = (file, cls) => {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/window\.\w+\s*=\s*new \w+\(\);?/g, '');
  const ctx = vm.createContext({ Math, console });
  vm.runInContext(`${src}\nglobalThis.__C = ${cls};`, ctx);
  return Object.create(ctx.__C.prototype); // 생성자(DOM)를 건너뛰고 메서드만 쓴다
};
const want = process.argv.slice(2);
const on = (k) => !want.length || want.includes(k);
const pct = (x) => (x * 100).toFixed(1) + '%';

// 공략에 나오는 두 기법(단일 후보: 그 칸에 들어갈 숫자가 하나뿐 / 숨은 단일: 그 숫자가 들어갈 칸이 줄·칸·상자에 하나뿐)
// 만으로 끝까지 풀리는지. 풀리면 true.
const UNITS = [];
for (let k = 0; k < 9; k++) {
  UNITS.push([...Array(9).keys()].map((c) => k * 9 + c));
  UNITS.push([...Array(9).keys()].map((r) => r * 9 + k));
  UNITS.push([...Array(9).keys()].map((j) => (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)));
}
const PEERS = [...Array(81).keys()].map((i) => new Set(UNITS.filter((u) => u.includes(i)).flat().filter((j) => j !== i)));
function solvesWithSingles(cells) {
  const b = cells.slice();
  const cand = (i) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => ![...PEERS[i]].some((j) => b[j] === n));
  for (let progress = true; progress;) {
    progress = false;
    for (let i = 0; i < 81; i++) if (!b[i]) { const c = cand(i); if (c.length === 1) { b[i] = c[0]; progress = true; } }
    for (const u of UNITS) {
      for (let n = 1; n <= 9; n++) {
        if (u.some((i) => b[i] === n)) continue;
        const spots = u.filter((i) => !b[i] && cand(i).includes(n));
        if (spots.length === 1) { b[spots[0]] = n; progress = true; }
      }
    }
  }
  return !b.includes(0);
}

if (on('sudoku')) {
  const s = load('sudoku.js', 'Sudoku');
  s.rand = Math.random;
  const N = 100;
  for (const [diff, target] of [['easy', 45], ['normal', 36], ['hard', 30]]) {
    const givens = [];
    let singles = 0;
    for (let i = 0; i < N; i++) {
      s.newPuzzle(diff);
      givens.push(s.cells.filter((v) => v !== 0).length);
      if (s.countSolutions(s.cells.slice(), 2) !== 1) throw new Error('유일해가 아닌 퍼즐');
      if (solvesWithSingles(s.cells)) singles++;
    }
    const avg = givens.reduce((a, b) => a + b, 0) / N;
    console.log(`sudoku ${diff.padEnd(6)} 목표 ${target}칸 → 실제 평균 ${avg.toFixed(1)}칸 (목표 도달 ${givens.filter((g) => g === target).length}/${N}), 유일해 ${N}/${N}, 단일 후보·숨은 단일만으로 풀림 ${singles}/${N}`);
  }
}

if (on('mine')) {
  const m = load('minesweeper.js', 'Minesweeper');
  m.rc = (i) => [Math.floor(i / m.n), i % m.n];
  m.idx = (r, c) => r * m.n + c;
  const N = 10000;
  for (const [diff, n, mines] of [['easy', 9, 10], ['normal', 12, 20], ['hard', 16, 40]]) {
    m.n = n; m.mines = mines;
    let opened = 0, center = 0;
    for (let t = 0; t < N; t++) {
      m.cells = Array.from({ length: n * n }, () => ({ mine: false, open: false, flag: false, adj: 0 }));
      const first = Math.floor(Math.random() * n * n);
      m.placeMines(first);
      m.floodOpen(first);
      opened += m.cells.filter((c) => c.open).length;
      if (first === m.idx(n >> 1, n >> 1)) center++;
    }
    const safe = n * n - mines;
    console.log(`mine   ${diff.padEnd(6)} ${n}×${n} 지뢰 ${mines}개(밀도 ${pct(mines / (n * n))}) → 첫 클릭에 평균 ${(opened / N).toFixed(1)}칸 열림 (안전한 칸의 ${pct(opened / N / safe)}), ${N}판`);
  }
}

if (on('2048')) {
  const g = load('2048.js', 'Game2048');
  const play = (pick) => {
    g.grid = Array(16).fill(0); g.score = 0;
    g.addRandom(); g.addRandom();
    for (;;) {
      const tried = new Set();
      let moved = false;
      while (!moved && tried.size < 4) {
        const dir = pick(tried);
        tried.add(dir);
        const before = g.grid.join();
        const grid = g.to2D();
        for (let i = 0; i < 4; i++) g.writeLine(grid, dir, i, g.slideLine(g.extractLine(grid, dir, i)).line);
        if (grid.flat().join() !== before) { g.grid = grid.flat(); g.addRandom(); moved = true; }
      }
      if (!moved) return Math.max(...g.grid);
    }
  };
  const DIRS = ['up', 'down', 'left', 'right'];
  const random = (tried) => { const left = DIRS.filter((d) => !tried.has(d)); return left[Math.floor(Math.random() * left.length)]; };
  const corner = (tried) => ['down', 'left', 'right', 'up'].find((d) => !tried.has(d)); // 아래·왼쪽 우선, 위는 마지막
  const N = 1000;
  for (const [name, pick] of [['무작위', random], ['모서리', corner]]) {
    const best = {};
    for (let i = 0; i < N; i++) { const t = play(pick); best[t] = (best[t] || 0) + 1; }
    const reach = (v) => Object.entries(best).filter(([t]) => +t >= v).reduce((s, [, c]) => s + c, 0) / N;
    console.log(`2048   ${name} 전략 ${N}판: 최고 타일 ${JSON.stringify(best)} | 256 이상 ${pct(reach(256))}, 512 이상 ${pct(reach(512))}, 1024 이상 ${pct(reach(1024))}, 2048 ${pct(reach(2048))}`);
  }
}

if (on('ladder')) {
  const l = load('ladder.js', 'Ladder');
  l.ROWS = 9;
  l.canvas = { height: 100 };
  const N = 200000;
  for (const n of [2, 3, 4, 5, 6]) {
    l.n = n; l.xs = Array.from({ length: n }, (_, i) => i);
    const hit = Array.from({ length: n }, () => Array(n).fill(0));
    for (let t = 0; t < N; t++) {
      l.rungs = l.generateRungs(n);
      const seen = new Set();
      for (let s = 0; s < n; s++) { const d = l.trace(s).col; hit[s][d]++; seen.add(d); }
      if (seen.size !== n) throw new Error('두 사람이 같은 결과');
    }
    const p = hit.map((row) => row.map((c) => c / N));
    const max = Math.max(...p.flat()), min = Math.min(...p.flat()), same = p.reduce((s, row, i) => s + row[i], 0) / n;
    // 공정성 점검: 20만 번이면 표준오차가 0.1%p 안팎이라 1%p를 넘으면 치우친 것
    if (Math.max(max - 1 / n, 1 / n - min) > 0.01) { console.error(`FAIL ladder ${n}명 치우침 ${pct(min)}~${pct(max)}`); process.exitCode = 1; }
    console.log(`ladder ${n}명 ${N}번: 공평하면 ${pct(1 / n)} → 실제 ${pct(min)}~${pct(max)}, 제자리(같은 번호) ${pct(same)} | 1번 출발: ${p[0].map(pct).join(' ')}`);
  }
}
