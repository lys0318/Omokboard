// 윷놀이 AI 난이도 검사: 실제 yut.js AI끼리 대국시켜 승률로 난이도 순서를 확인한다.
// 실행: node scripts/yut-ai-check.mjs [판 수]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../yut.js', import.meta.url), 'utf8')
  .replace('window.yutGame = new YutGame();', 'globalThis.YutGame = YutGame;'); // DOM 없이 클래스만 꺼낸다
const ctx = vm.createContext({ Math });
vm.runInContext(src, ctx);
const { YutGame } = ctx;

// 실제 게임 흐름과 같게: 윷·모면 계속 던지고, 결과를 다 쓴 뒤 잡았으면 한 번 더 던진다.
function play(diffP1, diffP2) {
  const g = Object.create(YutGame.prototype);
  const W = -1;
  g.players = { p1: { tokens: [W, W, W, W], done: 0 }, p2: { tokens: [W, W, W, W], done: 0 } };
  const diff = { p1: diffP1, p2: diffP2 };
  for (let turn = 0, me = 'p1'; turn < 2000; turn++, me = me === 'p1' ? 'p2' : 'p1') {
    g.difficulty = diff[me];
    g.results = [];
    let canThrow = true;
    while (canThrow) {
      while (canThrow) { const r = g.rollYut(); g.results.push(r); canThrow = r.v === 4 || r.v === 5; }
      while (g.results.length) {
        const m = g.aiChoose(me);
        if (!m) break;
        g.results.splice(g.results.indexOf(m.res), 1);
        if (g.executeMove(me, m.i, m.res.v).captured) canThrow = true;
        if (g.players[me].done >= 4) return me;
      }
    }
  }
  throw new Error('게임이 끝나지 않음');
}

// a가 b를 이긴 비율 (선공을 반반 나눠 선공 이점을 지운다)
function winRate(a, b, n) {
  let w = 0;
  for (let i = 0; i < n; i++) w += i % 2 ? play(a, b) === 'p1' : play(b, a) === 'p2';
  return w / n;
}

const n = Number(process.argv[2]) || 4000;
const rows = [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']].map(([a, b]) => [a, b, winRate(a, b, n)]);
for (const [a, b, r] of rows) console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}  ${(r * 100).toFixed(1)}%  (${n}판)`);
// 윷놀이는 운 비중이 커서 실력 차도 승률 차이가 크지 않다. 기준은 "확실히 반 이상"만 본다.
const bad = rows.filter(([, , r]) => r < 0.53);
if (bad.length) { console.error('난이도 순서가 뒤집힘:', bad.map(([a, b]) => `${a}<${b}`).join(', ')); process.exit(1); }
console.log('OK: 어려움 > 보통 > 쉬움');
