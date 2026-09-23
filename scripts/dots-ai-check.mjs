// 점잇기 AI 난이도 검사: 실제 dots.js AI끼리 대국시켜 승률로 난이도 순서를 확인한다.
// 실행: node scripts/dots-ai-check.mjs [판 수]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadDots(file = new URL('../dots.js', import.meta.url)) {
  const src = readFileSync(file, 'utf8').replace('window.dotsGame = new DotsGame();', 'globalThis.DotsGame = DotsGame;'); // DOM 없이 클래스만
  const ctx = vm.createContext({ Math });
  vm.runInContext(src, ctx);
  const g = Object.create(ctx.DotsGame.prototype);
  g.DOTS = 6; g.BOXES = 5;
  return g;
}

// engines = { red, blue }: 각자 getBestMove를 부를 AI(같은 판 배열을 공유), diff = { red, blue }
export function play(engines, diff) {
  const first = engines.red, L = first.emptyLines(), boxes = first.emptyBoxes();
  for (const e of Object.values(engines)) { e.hLines = L.h; e.vLines = L.v; e.boxes = boxes; }
  const score = { red: 0, blue: 0 };
  let turn = 'red';
  while (score.red + score.blue < 25) {
    const g = engines[turn];
    g.difficulty = diff[turn];
    const m = g.getBestMove();
    if (!m || g.isLineTaken(m)) throw new Error(`잘못된 수: ${JSON.stringify(m)}`);
    g.setLine(m, turn);
    let done = 0;
    for (const b of g.adjacentBoxes(m)) if (!boxes[b.r][b.c] && g.countBoxSides(b.r, b.c) === 4) { boxes[b.r][b.c] = turn; done++; }
    if (done) score[turn] += done; else turn = turn === 'red' ? 'blue' : 'red';
  }
  return score.red > score.blue ? 'red' : 'blue'; // 25칸이라 무승부 없음
}

// a가 b를 이긴 비율 (선공을 반반 나눈다)
export function winRate(ga, a, gb, b, n) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const aRed = i % 2 === 0;
    const res = play(aRed ? { red: ga, blue: gb } : { red: gb, blue: ga }, aRed ? { red: a, blue: b } : { red: b, blue: a });
    w += (res === 'red') === aRed;
  }
  return w / n;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('dots-ai-check.mjs')) {
  const n = Number(process.argv[2]) || 1000;
  const g = loadDots(), g2 = loadDots();
  const rows = [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']].map(([a, b]) => [a, b, winRate(g, a, g2, b, n)]);
  for (const [a, b, r] of rows) console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}  ${(r * 100).toFixed(1)}%  (${n}판)`);
  const bad = rows.filter(([, , r]) => r < 0.6);
  if (bad.length) { console.error('난이도 차이가 부족함:', bad.map(([a, b]) => `${a} vs ${b}`).join(', ')); process.exit(1); }
  console.log('OK: 어려움 > 보통 > 쉬움');
}
