// AI 난이도 실측: 실제 게임 코드의 AI끼리 대국시켜 승률과 한 수 계산 시간을 잰다.
// 오목·사목·틱택토(기본·얼티메이트)·체스. 윷놀이·리버시·점잇기는 각 *-ai-check.mjs가 잰다.
// 실행: node scripts/ai-benchmark.mjs [게임...]   (체스는 사이트와 같은 chess.js 0.10.3을 cdnjs에서 받는다)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
const strip = src => src.replace(/window\.\w+\s*=\s*new \w+\(\);?/g, ''); // DOM 생성자 호출 제거
function load(files, cls) {
  const ctx = vm.createContext({ Math, Date, console });
  for (const f of files) vm.runInContext(strip(read(f)), ctx);
  vm.runInContext(`globalThis.__C = ${cls};`, ctx);
  return () => Object.create(ctx.__C.prototype);
}
const rand = a => a[Math.floor(Math.random() * a.length)];
const times = {};
function timed(key, fn) { const t = performance.now(); const r = fn(); (times[key] ??= []).push(performance.now() - t); return r; }

// ── 오목·사목: 15×15, AI는 백(노랑) 쪽으로만 두므로 반대편 차례엔 색을 바꿔 묻는다 ──
function gomokuGame(make, size, [first, second], label) {
  return (diff) => {
    const g = make(); g.boardSize = size; g.ROWS = size; g.COLS = size;
    const b = Array.from({ length: size }, () => Array(size).fill(null));
    const swap = x => x.map(r => r.map(c => (c === first ? second : c === second ? first : c)));
    let turn = first;
    for (let ply = 0; ply < size * size; ply++) {
      let r, c;
      if (ply < 2) { do { r = 5 + Math.floor(Math.random() * 5); c = 5 + Math.floor(Math.random() * 5); } while (b[r][c]); } // 시작 2수는 중앙 근처 무작위
      else {
        g.difficulty = diff[turn]; g.board = turn === second ? b : swap(b);
        ({ r, c } = timed(`${label}:${diff[turn]}`, () => g.getBestMove()));
      }
      b[r][c] = turn; g.board = b;
      if (g.checkWin(r, c)) return turn;
      turn = turn === first ? second : first;
    }
    return 'draw';
  };
}

// ── 틱택토 기본: AI는 O 쪽 ──
function tttGame(make) {
  return (diff) => {
    const g = make(); g.ai = 'O'; g.human = 'X';
    g.WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; // 생성자에서 만드는 값
    const b = Array(9).fill(null);
    for (let ply = 0, turn = 'X'; ply < 9; ply++, turn = turn === 'X' ? 'O' : 'X') {
      g.difficulty = diff[turn];
      g.board = turn === 'O' ? b : b.map(v => (v === 'X' ? 'O' : v === 'O' ? 'X' : v));
      const i = g.getAIMove();
      b[i] = turn;
      if (g.getWinLine(b, turn)) return turn;
    }
    return 'draw';
  };
}

// ── 얼티메이트: AI는 O 쪽 ──
function utttGame(make) {
  return (diff) => {
    const g = make(); g.ai = 'O'; g.human = 'X';
    g.BOARD_W = [3,2,3, 2,4,2, 3,2,3]; // 클래스 필드(생성자에서 만들어짐)
    let s = { boards: Array.from({ length: 9 }, () => Array(9).fill(null)), boardWinner: Array(9).fill(null), activeBoard: null };
    const flip = v => (v === 'X' ? 'O' : v === 'O' ? 'X' : v);
    for (let turn = 'X'; ; turn = turn === 'X' ? 'O' : 'X') {
      g.difficulty = diff[turn];
      g.boards = turn === 'O' ? s.boards : s.boards.map(x => x.map(flip));
      g.boardWinner = turn === 'O' ? s.boardWinner : s.boardWinner.map(flip);
      g.activeBoard = s.activeBoard;
      if (!g.legalMoves().length) return 'draw';
      const { sb, c } = timed(`uttt:${diff[turn]}`, () => g.getAIMove());
      s = g.applyState(s, sb, c, turn);
      const big = g.winnerOf(s.boardWinner.map(w => (w === 'X' || w === 'O' ? w : null)));
      if (big) return big;
    }
  };
}

// ── 체스: 엔진은 흑 쪽으로만 두므로 백 차례엔 판을 뒤집은 FEN으로 묻는다 ──
async function chessGame() {
  const lib = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js')).text();
  const ctx = vm.createContext({ Math, Date, console });
  vm.runInContext(lib, ctx);
  for (const f of ['chess-ai.js', 'chess.js']) vm.runInContext(strip(read(f)), ctx);
  const proto = vm.runInContext('ChessGame', ctx).prototype;
  const swapCase = s => s.replace(/[a-zA-Z]/g, ch => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()));
  const mir = sq => sq[0] + (9 - Number(sq[1]));
  const mirrorFen = fen => {
    const [b, t, c, ep, h, f] = fen.split(' ');
    return [b.split('/').reverse().map(swapCase).join('/'), t === 'w' ? 'b' : 'w',
      c === '-' ? '-' : [...'KQkq'].filter(x => swapCase(c).includes(x)).join(''), ep === '-' ? '-' : mir(ep), h, f].join(' ');
  };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  return (diff) => {
    const real = new ctx.Chess();
    const g = Object.create(proto);
    let ply = 0;
    while (!real.game_over() && ply < 200) {
      if (ply < 4) { real.move(rand(real.moves())); ply++; continue; } // 시작 4수 무작위
      const white = real.turn() === 'w', side = white ? 'w' : 'b';
      g.difficulty = diff[side];
      g.chess = new ctx.Chess(white ? mirrorFen(real.fen()) : real.fen());
      const m = timed(`chess:${diff[side]}`, () => g.getBestMove());
      real.move({ from: white ? mir(m.from) : m.from, to: white ? mir(m.to) : m.to, promotion: m.promotion });
      ply++;
    }
    if (real.in_checkmate()) return real.turn() === 'w' ? 'b' : 'w';
    if (ply >= 200) { // 200수 제한: 기물 점수 3점 이상 앞서면 승리로 판정
      let m = 0; for (const row of real.board()) for (const p of row) if (p) m += (p.color === 'w' ? 1 : -1) * VAL[p.type];
      return m >= 3 ? 'w' : m <= -3 ? 'b' : 'draw';
    }
    return 'draw';
  };
}

// a가 b와 n판(선후 반반) → [승, 무, 패, 선공 승]
function match(play, sides, a, b, n) {
  const res = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const aFirst = i % 2 === 0, [s1, s2] = sides;
    const r = play(aFirst ? { [s1]: a, [s2]: b } : { [s1]: b, [s2]: a });
    if (r === 'draw') res[1]++; else res[(r === s1) === aFirst ? 0 : 2]++;
    if (r === s1) res[3]++;
  }
  return res;
}

const want = process.argv.slice(2);
const games = {
  omok: () => [gomokuGame(load(['script.js'], 'OmokGame'), 15, ['black', 'white'], 'omok'), ['black', 'white'], 20],
  connect4: () => [gomokuGame(load(['connect4.js'], 'Connect4'), 15, ['red', 'yellow'], 'connect4'), ['red', 'yellow'], 20],
  tictactoe: () => [tttGame(load(['tictactoe.js'], 'TicTacToe')), ['X', 'O'], 40],
  ultimate: () => [utttGame(load(['ultimate.js'], 'UltimateTTT')), ['X', 'O'], 20],
  chess: async () => [await chessGame(), ['w', 'b'], 20],
};
const pairs = [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']];
for (const name of Object.keys(games)) {
  if (want.length && !want.includes(name)) continue;
  const [play, sides, n] = await games[name]();
  for (const [a, b] of pairs) {
    const [w, d, l, f] = match(play, sides, a, b, n);
    console.log(`${name.padEnd(9)} ${a.padEnd(6)} vs ${b.padEnd(6)} ${w}승 ${d}무 ${l}패 (${n}판, 선공 승 ${f})`);
  }
}
for (const [k, v] of Object.entries(times)) {
  v.sort((x, y) => x - y);
  console.log(`time ${k.padEnd(16)} avg ${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)}ms  p95 ${v[Math.floor(v.length * 0.95)].toFixed(0)}ms  max ${v.at(-1).toFixed(0)}ms  (${v.length}수)`);
}
