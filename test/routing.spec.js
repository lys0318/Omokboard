import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('라우팅', () => {
  it('POST /api/room 은 코드와 토큰을 준다', async () => {
    const res = await SELF.fetch('https://example.com/api/room', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'omok' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toHaveLength(6);
    expect(typeof body.token).toBe('string');
    expect(body.color).toBe('black');
  });

  it('알 수 없는 /api 경로는 404', async () => {
    const res = await SELF.fetch('https://example.com/api/nope');
    expect(res.status).toBe(404);
  });

  it('www 주소는 경로·쿼리를 유지한 채 정본 주소로 301', async () => {
    const res = await SELF.fetch('https://www.omokboard.com/omok-guide?x=1', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://omokboard.com/omok-guide?x=1');
  });

  it('정본 주소의 페이지는 리다이렉트 없이 그대로', async () => {
    const res = await SELF.fetch('https://omokboard.com/omok-guide', { redirect: 'manual' });
    expect(res.status).toBe(200);
  });
});
