// 숫자야구 서버 판정 (순수 함수). 저장·전송은 room.js가 한다.
// 비밀 숫자는 room.js가 공개 상태(state)와 다른 저장 키(secrets)에 두고, 여기서는 판정에만 쓴다.
// 공개 상태: { digits, phase: 'setup'|'playing'|'final'|'over', first, history: [{color, guess, strikes, balls}], ready, result }
// 규칙은 number-baseball.js의 BaseballCore와 같아야 한다 (scripts/baseball-ai-check.mjs가 둘을 대조).

export const GAME_ID = 'number-baseball';

export function isValid(s, n) {
  return typeof s === 'string' && s.length === n && /^[1-9]+$/.test(s) && new Set(s).size === n;
}

export function score(secret, guess) {
  let strikes = 0, balls = 0;
  for (let i = 0; i < guess.length; i++) {
    if (secret[i] === guess[i]) strikes++;
    else if (secret.includes(guess[i])) balls++;
  }
  return { strikes, balls };
}

const other = (c) => (c === 'black' ? 'white' : 'black');

export function initialState(digits, first = 'black') {
  return { digits: digits === 4 ? 4 : 3, phase: 'setup', first, history: [], ready: {}, result: null };
}

// 내 숫자 등록. 둘 다 정하면 선공 차례로 시작한다.
export function applySecret(state, color, secret, alreadySet) {
  if (state.phase !== 'setup') return { error: 'BAD_PHASE' };
  if (alreadySet) return { error: 'ALREADY_SET' };
  if (!isValid(secret, state.digits)) return { error: 'BAD_NUMBER' };
  const ready = { ...state.ready, [color]: true };
  const both = !!(ready.black && ready.white);
  return { state: { ...state, ready, phase: both ? 'playing' : 'setup' }, turn: both ? state.first : null };
}

// 숫자 부르기. 선공이 맞히면 후공에게 마지막 한 번(final), 둘 다 맞히면 무승부.
export function applyGuess(state, color, guess, secrets) {
  if (state.phase !== 'playing' && state.phase !== 'final') return { error: 'BAD_PHASE' };
  if (!isValid(guess, state.digits)) return { error: 'BAD_NUMBER' };
  const { strikes, balls } = score(secrets[other(color)], guess);
  const hit = strikes === state.digits;
  let phase = state.phase, result = null;
  if (state.phase === 'final') { phase = 'over'; result = hit ? 'draw' : state.first; }
  else if (hit && color === state.first) phase = 'final';
  else if (hit) { phase = 'over'; result = color; }
  const history = [...state.history, { color, guess, strikes, balls }];
  return { state: { ...state, history, phase, result }, turn: phase === 'over' ? null : other(color) };
}
