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

    // 좌석 배정 없이 코드만으로 게임 종류를 확인한다(틱택토 클래식/얼티메이트처럼
    // 한 페이지에 여러 게임 엔진이 걸려 있을 때 입장 전에 화면을 고르는 데 사용).
    const infoMatch = url.pathname.match(/^\/api\/room\/([A-Z0-9]{6})\/info$/);
    if (infoMatch && request.method === 'GET') {
      const stub = env.ROOM.get(env.ROOM.idFromName(infoMatch[1]));
      return stub.fetch('https://do/info');
    }

    // 방 코드 하나가 DO 인스턴스 하나에 대응한다.
    const m = url.pathname.match(/^\/api\/room\/([A-Z0-9]{6})$/);
    if (m) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      return stub.fetch(request);
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
