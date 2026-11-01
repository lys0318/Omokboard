// fx.js 순수 함수 점검: 결과 창 제목으로 이김 판정(isWin), 문장 속 셀 숫자 찾기(countables).
// 실행: node scripts/fx-check.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console });
vm.runInContext(readFileSync(new URL('../fx.js', import.meta.url), 'utf8') + '\nglobalThis.FX = FX;', ctx);
const { isWin, countables } = ctx.FX;

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.error('FAIL', msg); } };

// 1) 이김 판정: 게임들이 실제로 쓰는 결과 제목 (2048은 한/영 span이 붙어 textContent가 이어진다)
for (const t of ['승리!', '빨강 승리!', '흑 승리!', 'You Win!', 'Red Wins!', 'Blue Wins!', '정답!', '완성!', 'Solved!', '2048 달성!You reached 2048!']) {
  check(isWin(t) === true, `isWin(${JSON.stringify(t)}) 은 true여야 함`);
}
for (const t of ['패배', '패배...', 'You Lose', '무승부', '무승부입니다!', 'Draw', '펑!', 'Boom!', '게임 오버Game Over', '']) {
  check(isWin(t) === false, `isWin(${JSON.stringify(t)}) 은 false여야 함`);
}

// 2) 셀 숫자: 2 이상 정수, 쉼표 자리 구분 허용, 시간(1:23)·소수(3.5) 제외
const values = (s) => JSON.stringify(countables(s).map((c) => c.value));
check(JSON.stringify(countables('8번 만에 맞혔습니다').map((c) => ({ start: c.start, end: c.end, value: c.value }))) === JSON.stringify([{ start: 0, end: 1, value: 8 }]), `countables('8번 만에') = ${JSON.stringify(countables('8번 만에 맞혔습니다'))}`);
check(values('나 7번 쳐서 5번 뒤집기 · AI 2번 쳐서 0번 뒤집기') === '[7,5,2]', `딱지 문장 ${values('나 7번 쳐서 5번 뒤집기 · AI 2번 쳐서 0번 뒤집기')}`);
check(values('시간 1:23') === '[]', `시간 ${values('시간 1:23')}`);
check(values('3,024가지') === '[3024]', `쉼표 ${values('3,024가지')}`);
check(values('3.5배') === '[]', `소수 ${values('3.5배')}`);
check(values('2048점') === '[2048]', `2048 ${values('2048점')}`);
// start/end가 원문 위치와 맞는지 (쉼표 포함 토막 전체)
const s = '총 3,024가지 중 12번';
for (const c of countables(s)) check(/^[\d,]+$/.test(s.slice(c.start, c.end)), `위치 어긋남 ${JSON.stringify(c)}`);

if (failed) { console.error(`${failed}개 실패`); process.exit(1); }
console.log('OK');
