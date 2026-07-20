import { describe, it, expect } from 'vitest';
import { generateCode, ALPHABET } from '../worker/code.js';

describe('generateCode', () => {
  it('6자를 반환한다', () => {
    expect(generateCode()).toHaveLength(6);
  });

  it('혼동 문자를 쓰지 않는다', () => {
    for (const ch of '0O1IL') expect(ALPHABET).not.toContain(ch);
  });

  it('허용 알파벳만 사용한다', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of generateCode()) expect(ALPHABET).toContain(ch);
    }
  });

  it('난수 함수를 주입하면 결정적으로 동작한다', () => {
    const rand = () => 0; // 항상 첫 글자
    expect(generateCode(rand)).toBe(ALPHABET[0].repeat(6));
  });
});
