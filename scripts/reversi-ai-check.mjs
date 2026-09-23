// 리버시 AI 난이도 검사: 실제 reversi.js AI끼리 대국시켜 승률로 난이도 순서를 확인한다.
// 실행: node scripts/reversi-ai-check.mjs [판 수]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.env.REVERSI_SRC || new URL('../reversi.js', import.meta.url);
const src = readFileSync(file, 'utf8')
  .replace('window.reversiGame = new ReversiGame();', 'globalThis.ReversiGame = ReversiGame;'); // DOM 없이 클래스만 꺼낸다
const ctx = vm.createContext({ Math });
vm.runInContext(src, ctx);
const g = Object.create(ctx.ReversiGame.prototype);
g.SIZE = 8;

// AI는 백 기준으로만 두므로, 흑 차례에는 판의 색을 뒤집어 물어본다.
const swap = b => b.map(row => row.map(c => (c === 'black' ? 'white' : c === 'white' ? 'black' : null)));
const other = t => (t === 'black' ? 'white' : 'black');
const times = [];

function play(diff) { // diff = { black, white } → 'black' | 'white' | 'draw'
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[3][3] = b[4][4] = 'white'; b[3][4] = b[4][3] = 'black';
  let turn = 'black';
  for (;;) {
    if (!g.getValidMoves(turn, b).length) {
      if (!g.getValidMoves(other(turn), b).length) break;
      turn = other(turn); continue;
    }
    g.difficulty = diff[turn];
    g.board = turn === 'white' ? b : swap(b);
    const t0 = performance.now();
    const m = g.getBestMove();
    if (diff[turn] === 'hard') times.push(performance.now() - t0);
    const flips = g.getFlips(m.r, m.c, turn, b);
    b[m.r][m.c] = turn; flips.forEach(({ r, c }) => { b[r][c] = turn; });
    turn = other(turn);
  }
  let d = 0; for (const row of b) for (const c of row) d += c === 'black' ? 1 : c === 'white' ? -1 : 0;
  return d > 0 ? 'black' : d < 0 ? 'white' : 'draw';
}

// a가 b를 이긴 비율 (흑백을 반반 나눠 선공 차이를 지운다, 무승부는 0.5)
function winRate(a, b, n) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const aColor = i % 2 ? 'black' : 'white';
    const res = play({ [aColor]: a, [other(aColor)]: b });
    w += res === aColor ? 1 : res === 'draw' ? 0.5 : 0;
  }
  return w / n;
}

const n = Number(process.argv[2]) || 200;
const rows = [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']].map(([a, b]) => [a, b, winRate(a, b, n)]);
for (const [a, b, r] of rows) console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}  ${(r * 100).toFixed(1)}%  (${n}판)`);
times.sort((x, y) => x - y);
console.log(`어려움 한 수 계산: 평균 ${(times.reduce((s, t) => s + t, 0) / times.length).toFixed(1)}ms, 최대 ${times.at(-1).toFixed(0)}ms`);
const bad = rows.filter(([, , r]) => r < 0.6);
if (bad.length) { console.error('난이도 차이가 부족함:', bad.map(([a, b]) => `${a} vs ${b}`).join(', ')); process.exit(1); }
console.log('OK: 어려움 > 보통 > 쉬움');
