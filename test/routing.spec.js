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
});
