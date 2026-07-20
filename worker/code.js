// 방 코드 알파벳: 혼동 문자(0 O 1 I L) 제외 — 사람이 불러주고 받아적기 쉬워야 한다.
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(rand = Math.random) {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}
