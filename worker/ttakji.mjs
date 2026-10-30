// 딱지치기 서버: 입력 검사만 한다(순수 함수). 뒤집힘 판정은 양쪽 브라우저가 같은 식(ttakji.js의
// TtakjiCore)으로 하고, 서버는 조작할 수 없는 난수만 정해 준다 — 윷놀이에서 윷가락만 던지는 것과 같다.
// 판 크기는 ttakji.js의 BOARD와 같아야 한다 (scripts/ttakji-check.mjs가 둘을 대조).

export const GAME_ID = 'ttakji';
export const BOARD = 400;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function isValidShot(x, y, power) {
  return num(x) && num(y) && num(power) && x >= 0 && x <= BOARD && y >= 0 && y <= BOARD && power >= 0 && power <= 1;
}

// 처음·재대결 상태: 5장씩, 첫 바닥 딱지(k=0). 방장이 보낸 값은 쓰지 않는다.
export const initialState = () => ({ counts: { black: 5, white: 5 }, k: 0 });
