// 체스 AI 엔진(chess-ai.js) 검사: 수 생성이 정확한지 표준 perft 값으로 확인하고, 어려움 한 수 계산 시간을 잰다.
// 실행: node scripts/chess-ai-check.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ Date });
vm.runInContext(readFileSync(new URL('../chess-ai.js', import.meta.url), 'utf8') + '\nglobalThis.ChessAI = ChessAI;', ctx);
const { ChessAI } = ctx;

// 체스 프로그램들이 쓰는 표준 검증값. Kiwipete는 캐슬링·앙파상·핀이 섞인 국면이다.
// (이 깊이까지는 승격이 나오지 않아, 퀸 승격만 만드는 이 엔진도 표준값과 같아야 한다)
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KIWI = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
let failed = 0;
for (const [name, fen, depth, want] of [['시작', START, 3, 8902], ['시작', START, 4, 197281], ['Kiwipete', KIWI, 2, 2039], ['Kiwipete', KIWI, 3, 97862]]) {
  const got = ChessAI.perft(fen, depth);
  if (got !== want) failed++;
  console.log(`perft ${name} ${depth}수: ${got} ${got === want ? 'OK' : `틀림 (기대값 ${want})`}`);
}

// 어려움과 같은 설정: 3수는 항상, 4수는 1초 안에 끝날 때만 + 잡는 수 연장
for (const [name, fen] of [
  ['초반', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R b KQkq - 0 5'],
  ['중반', 'r2q1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R b KQ - 3 9'],
]) {
  const t0 = Date.now();
  const [best] = ChessAI.rank(fen, 4, true, 3, 1000);
  console.log(`어려움 ${name}: ${best.from}${best.to} (${Date.now() - t0}ms)`);
}
if (failed) process.exit(1);
