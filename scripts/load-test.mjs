// 오목 온라인 대전 부하 테스트 — 실제 배포된 주소를 상대로 동시성 스트레스를 건다.
// 사용법: npm run load-test -- [방 개수]   (기본 60, 기본 대상은 테스트 서브도메인)
//   대상 바꾸기: LOAD_TEST_HOST=other.example.com npm run load-test -- 100
//
// 단계:
//   1) 방 N개를 동시에 생성 (버스트)
//   2) 방마다 플레이어 2명을 동시에 접속시켜 2/2(대국 시작) 확인
//   3) 방마다 유효한 교대 착수를 몇 수씩 동시에 진행
//   4) 방마다 양쪽이 "진짜 동시에" 재대결을 눌러 레이스 컨디션(blockConcurrencyWhile) 재검증
//   5) 결과 집계 및 리포트 출력

const HOST = process.env.LOAD_TEST_HOST || 'omokboard.lys03.workers.dev';
const ROOM_COUNT = parseInt(process.argv[2] || '60', 10);
const MOVES_PER_PLAYER = 4; // 방마다 흑/백 각 4수 = 총 8수

const stats = {
  roomCreate: { ok: 0, fail: 0, latencies: [] },
  wsConnect: { ok: 0, fail: 0, latencies: [] },
  gameStart: { ok: 0, fail: 0, latencies: [] },
  moves: { ok: 0, rejected: 0, timeout: 0, latencies: [] },
  rematch: { ok: 0, fail: 0, latencies: [] },
  errors: [],
};

function pct(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)];
}
function summary(label, s) {
  const lat = s.latencies;
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
  console.log(
    `  ${label}: ok=${s.ok ?? ''} ${s.fail !== undefined ? `fail=${s.fail}` : ''} ${s.rejected !== undefined ? `rejected=${s.rejected} timeout=${s.timeout}` : ''}` +
    (avg !== null ? ` | latency avg=${avg}ms p50=${pct(lat, 0.5)}ms p95=${pct(lat, 0.95)}ms max=${Math.max(...lat)}ms` : '')
  );
}

async function createRoom() {
  const t0 = Date.now();
  try {
    const res = await fetch(`https://${HOST}/api/room`, {
      method: 'POST',
      body: JSON.stringify({ gameId: 'omok' }),
    });
    const dt = Date.now() - t0;
    if (!res.ok) { stats.roomCreate.fail++; stats.errors.push(`room create HTTP ${res.status}`); return null; }
    stats.roomCreate.ok++;
    stats.roomCreate.latencies.push(dt);
    return await res.json(); // { code, token, color }
  } catch (e) {
    stats.roomCreate.fail++;
    stats.errors.push(`room create: ${e.message}`);
    return null;
  }
}

// 소켓을 만드는 "동시에" 메시지 리스너를 건다(버퍼링) — Promise.all로 두 소켓을
// 동시에 열 때 하나가 먼저 open되고 다른 하나를 기다리는 사이 도착하는 메시지를
// (리스너를 아직 안 걸었다는 이유로) 놓치는 걸 방지한다. 이 버그 때문에 처음엔
// 진짜 서버 문제로 오인할 뻔했다.
function connectWS(code, token) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const qs = token ? `?token=${token}` : '';
    const ws = new WebSocket(`wss://${HOST}/api/room/${code}${qs}`);
    const buffer = [];
    ws.addEventListener('message', (e) => { buffer.push(JSON.parse(e.data)); });
    let opened = false;
    const timer = setTimeout(() => { ws.close(); reject(new Error('connect timeout (never opened)')); }, 10000);
    ws.addEventListener('open', () => {
      opened = true;
      clearTimeout(timer);
      stats.wsConnect.ok++;
      stats.wsConnect.latencies.push(Date.now() - t0);
      resolve({ ws, buffer });
    });
    ws.addEventListener('error', (e) => {
      clearTimeout(timer);
      if (!opened) {
        stats.wsConnect.fail++;
        reject(new Error(`ws error before open: ${e.message || e.error?.message || 'unknown'}`));
      } else {
        stats.wsConnect.errorAfterOpen = (stats.wsConnect.errorAfterOpen || 0) + 1;
      }
    });
    ws.addEventListener('close', (e) => {
      if (opened) {
        stats.wsConnect.closedAfterOpen = (stats.wsConnect.closedAfterOpen || 0) + 1;
        stats.errors.push(`ws closed after open: code=${e.code} reason=${e.reason || '(none)'}`);
      }
    });
  });
}

// 버퍼에 이미 도착해 있는 메시지부터 찾고, 없으면 폴링 — connectWS의 buffer와 짝
function waitFor(conn, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const idx = conn.buffer.findIndex(predicate);
      if (idx !== -1) return resolve(conn.buffer[idx]);
      if (Date.now() > deadline) return reject(new Error('wait timeout'));
      setTimeout(check, 5);
    };
    check();
  });
}

// 15x15 보드에서 방마다 겹치지 않는 좌표를 순서대로 뽑아 쓴다 (CELL_TAKEN 방지용, 실제 오목 규칙 검증은 서버가 안 함)
function cellSeq(i) { return `${Math.floor(i / 15)},${i % 15}`; }

async function runRoom(index) {
  const room = await createRoom();
  if (!room) return { ok: false };
  const { code, token } = room;

  let black, white;
  try {
    const t0 = Date.now();
    [black, white] = await Promise.all([connectWS(code, token), connectWS(code, null)]);
    // 접속 순서(흑 먼저 vs 백 먼저)에 따라 "playing" 신호가 자기 자신의 joined 메시지로
    // 오거나, 이미 붙어있던 소켓에 대한 status 브로드캐스트로 오거나 둘 중 하나다 —
    // 어느 쪽이 됐든 두 소켓 모두에서 "playing" 신호를 관측하면 대국 시작으로 본다.
    const playingSignal = (ws) => waitFor(ws, m =>
      (m.type === 'joined' && m.status === 'playing') ||
      (m.type === 'status' && m.status === 'playing')
    );
    await Promise.all([playingSignal(black), playingSignal(white)]);
    stats.gameStart.ok++;
    stats.gameStart.latencies.push(Date.now() - t0);
  } catch (e) {
    stats.gameStart.fail++;
    stats.errors.push(`room ${index} game start: ${e.message}`);
    try { black?.ws.close(); white?.ws.close(); } catch {}
    return { ok: false };
  }

  // 교대로 유효한 수를 둔다 (흑 먼저)
  let seq = 0, cellIdx = index * 50; // 방마다 다른 구간 사용 (교차 오염 여부도 같이 확인됨)
  for (let round = 0; round < MOVES_PER_PLAYER; round++) {
    for (const [mover, color] of [[black, 'black'], [white, 'white']]) {
      seq++;
      const cell = cellSeq(cellIdx++);
      const t0 = Date.now();
      mover.ws.send(JSON.stringify({ type: 'move', move: { cell, by: color, state: { board: [], turn: color } }, seq }));
      try {
        // 상대쪽에서 이 수의 브로드캐스트를 받는지로 왕복을 측정 (자기 자신 echo가 아닌 실제 전파 확인)
        const other = mover === black ? white : black;
        await waitFor(other, m => m.type === 'move' && m.seq === seq, 8000);
        stats.moves.ok++;
        stats.moves.latencies.push(Date.now() - t0);
      } catch (e) {
        stats.moves.timeout++;
        stats.errors.push(`room ${index} move seq=${seq}: ${e.message}`);
      }
    }
  }

  return { ok: true, black, white, code };
}

async function runRematchStress(rooms) {
  // 양쪽이 "진짜 동시에" 재대결을 눌렀을 때 blockConcurrencyWhile이 실제 배포 환경에서도
  // 버티는지 확인 — 로컬 vitest 테스트는 방 1개였지만 여기선 N개를 동시에 때린다.
  const t0 = Date.now();
  const results = await Promise.all(rooms.filter(r => r.ok).map(async (r) => {
    const rt0 = Date.now();
    try {
      const [aMsg, bMsg] = await Promise.all([
        (async () => { const p = waitFor(r.black, m => m.type === 'rematch_start', 8000); r.black.ws.send(JSON.stringify({ type: 'rematch' })); return p; })(),
        (async () => { const p = waitFor(r.white, m => m.type === 'rematch_start', 8000); r.white.ws.send(JSON.stringify({ type: 'rematch' })); return p; })(),
      ]);
      stats.rematch.ok++;
      stats.rematch.latencies.push(Date.now() - rt0);
      return true;
    } catch (e) {
      stats.rematch.fail++;
      stats.errors.push(`room ${r.code} rematch: ${e.message}`);
      return false;
    }
  }));
  return { count: results.length, ok: results.filter(Boolean).length, elapsed: Date.now() - t0 };
}

async function main() {
  console.log(`오목 온라인 대전 부하 테스트 — ${HOST}, 방 ${ROOM_COUNT}개 동시 진행\n`);

  const t0 = Date.now();
  console.log('[1/3] 방 생성 + 접속 + 착수 동시 진행...');
  const rooms = await Promise.all(Array.from({ length: ROOM_COUNT }, (_, i) => runRoom(i)));
  const t1 = Date.now();
  console.log(`  완료 (${t1 - t0}ms)`);

  console.log('[2/3] 전 방 동시 재대결(레이스 컨디션 재검증)...');
  const rematchResult = await runRematchStress(rooms);
  console.log(`  완료: ${rematchResult.ok}/${rematchResult.count} 성공 (${rematchResult.elapsed}ms)`);

  console.log('[3/3] 연결 정리...');
  for (const r of rooms) {
    if (r.ok) { try { r.black.ws.close(); r.white.ws.close(); } catch {} }
  }

  console.log('\n=== 결과 ===');
  summary('방 생성      ', stats.roomCreate);
  summary('WS 접속      ', stats.wsConnect);
  if (stats.wsConnect.errorAfterOpen || stats.wsConnect.closedAfterOpen) {
    console.log(`    (open 이후 error=${stats.wsConnect.errorAfterOpen || 0}, open 이후 close=${stats.wsConnect.closedAfterOpen || 0})`);
  }
  summary('대국 시작    ', stats.gameStart);
  summary('착수 왕복    ', stats.moves);
  summary('재대결       ', stats.rematch);
  console.log(`\n총 소요 시간: ${Date.now() - t0}ms`);
  if (stats.errors.length) {
    console.log(`\n에러 ${stats.errors.length}건 (최대 15개 표시):`);
    stats.errors.slice(0, 15).forEach(e => console.log(`  - ${e}`));
  } else {
    console.log('\n에러 없음.');
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
