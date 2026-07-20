import { generateCode } from './code.js';
export { RoomDO } from './room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /api 외의 경로는 정적 자산이 처리한다.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (url.pathname === '/api/room' && request.method === 'POST') {
      return createRoom(request, env);
    }
    return new Response('not found', { status: 404 });
  },
};

// 코드가 겹치면 다른 코드로 재시도한다.
async function createRoom(request, env) {
  const body = await request.text();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    const res = await stub.fetch('https://do/create', { method: 'POST', body });
    if (res.status === 201) {
      const data = await res.json();
      return Response.json({ code, ...data }, { status: 201 });
    }
  }
  return new Response(JSON.stringify({ error: 'NO_CODE_AVAILABLE' }), { status: 503 });
}
