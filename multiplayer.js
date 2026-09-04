// 온라인 방 대전 클라이언트. 게임 로직은 어댑터에 위임한다.
(function () {
  const GRACE_MS = 120000;
  const BACKOFF = [1000, 2000, 4000, 8000, 15000];

  function tokenKey(code) {
    return `omokboard.room.${code}`;
  }

  // 좌석 소유권은 "탭" 단위다. localStorage를 쓰면 같은 브라우저의 두 탭이
  // 토큰 하나를 공유해 서로 좌석을 뺏는다. sessionStorage는 새로고침엔 유지되고
  // 탭마다 분리되므로 재접속 요건을 만족하면서 충돌이 없다.
  const store = window.sessionStorage;

  window.Multiplayer = {
    start({ gameId, game, adapter, ui }) {
      const session = {
        gameId, game, adapter, ui,
        code: null, color: null, seq: 0,
        ws: null, attempt: 0, closedByUs: false, graceUntil: 0,
      };

      const joinCode = new URLSearchParams(location.search).get('room');
      if (joinCode) {
        session.code = joinCode.toUpperCase();
        connect(session);
      } else {
        createRoom(session);
      }

      // 대국 종료 후 명시적 액션. 끊김 재접속과는 별개 경로다.
      session.leave = () => {
        session.closedByUs = true; // close 핸들러가 재접속을 시도하지 않도록
        try { session.ws.send(JSON.stringify({ type: 'leave' })); } catch { /* 이미 끊김 */ }
        try { session.ws.close(); } catch { /* no-op */ }
      };
      session.rematch = () => {
        try { session.ws.send(JSON.stringify({ type: 'rematch' })); } catch { /* no-op */ }
      };

      return session;
    },
  };

  async function createRoom(session) {
    const res = await fetch('/api/room', {
      method: 'POST',
      body: JSON.stringify({ gameId: session.gameId }),
    });
    if (!res.ok) return session.ui.onError('CREATE_FAILED');
    const data = await res.json();
    session.code = data.code;
    store.setItem(tokenKey(data.code), data.token);
    session.ui.onCode(data.code, shareUrl(data.code));
    connect(session);
  }

  function shareUrl(code) {
    return `${location.origin}${location.pathname}?room=${code}`;
  }

  function connect(session) {
    const token = store.getItem(tokenKey(session.code)) || '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/room/${session.code}${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(url);
    session.ws = ws;

    ws.addEventListener('open', () => {
      session.attempt = 0;
      session.ui.onStatus('connected');
    });

    ws.addEventListener('message', (e) => handle(session, JSON.parse(e.data)));

    ws.addEventListener('close', (e) => {
      if (session.closedByUs) return;
      // 서버가 "더 새 연결로 교체됨"이라 알려준 경우엔 재접속하면 안 된다.
      // 재접속하면 서로 밀어내는 무한 루프가 된다.
      if (e && e.reason === 'REPLACED') {
        session.closedByUs = true;
        session.ui.onError('REPLACED');
        return;
      }
      scheduleReconnect(session);
    });
  }

  function scheduleReconnect(session) {
    if (!session.graceUntil) session.graceUntil = Date.now() + GRACE_MS;
    if (Date.now() > session.graceUntil) {
      return session.ui.onStatus('finished', { reason: 'DISCONNECTED' });
    }
    const wait = BACKOFF[Math.min(session.attempt, BACKOFF.length - 1)];
    session.attempt++;
    session.ui.onStatus('reconnecting', { wait });
    setTimeout(() => connect(session), wait);
  }

  function handle(session, msg) {
    const { game, adapter, ui } = session;

    switch (msg.type) {
      case 'joined':
        session.color = msg.color;
        session.seq = msg.seq;
        session.graceUntil = 0;
        if (msg.token) store.setItem(tokenKey(session.code), msg.token);
        // state.turn은 착수 시점(턴 전환 전) 값이라 한 수 밀린다. 서버 turn으로 덮어쓴다.
        if (msg.state) adapter.restore(game, { ...msg.state, turn: msg.turn || msg.state.turn });
        bindLocalMoves(session);
        ui.onCode(session.code, shareUrl(session.code));
        ui.onColor(msg.color);
        ui.onStatus(msg.status, { color: msg.color });
        if (msg.status === 'playing') game.startTimer();
        updateInput(session);
        break;

      case 'move':
        session.seq = msg.seq;
        // 내가 둔 수가 되돌아온 경우엔 이미 화면에 반영돼 있다.
        if (msg.move && msg.move.by !== session.color) {
          adapter.applyMove(game, msg.move);
        }
        game.startTimer(); // 서버가 턴을 넘겼으니 30초 카운트다운을 새로 시작
        updateInput(session);
        break;

      case 'timeout':
        // 시간 초과로 서버가 직접 턴을 넘긴 경우. 실제 착수가 없었으므로
        // applyMove는 부르지 않고 턴 표시와 카운트다운만 갱신한다.
        session.seq = msg.seq;
        game.currentTurn = msg.turn;
        game.updateUI();
        game.startTimer();
        updateInput(session);
        break;

      case 'rejected':
        // 서버가 권위. 받은 상태로 되돌린다.
        session.seq = msg.seq;
        if (msg.state) adapter.restore(game, { ...msg.state, turn: msg.turn || msg.state.turn });
        updateInput(session);
        ui.onError(msg.reason);
        break;

      case 'opponent':
        ui.onStatus(msg.event === 'left' ? 'opponent_left' : 'opponent_back');
        break;

      case 'status':
        // 상대가 "나가기"로 방을 떠난 경우: 새 상대를 기다리는 화면으로 돌아간다.
        // 지난 판이 화면에 남아있지 않도록 여기서 로컬 보드도 함께 비운다.
        if (msg.reason === 'OPPONENT_LEFT_ROOM') {
          session.seq = 0;
          game.resetGame();
        }
        ui.onStatus(msg.status, msg);
        // 정원이 차서 playing으로 바뀐 순간(상대가 막 들어온 쪽)에도 카운트다운 시작
        if (msg.status === 'playing') game.startTimer();
        updateInput(session);
        break;

      case 'rematch_wait':
        // 이 메시지는 항상 "상대방"이 요청했다는 뜻이다(내 요청은 나에게 되돌아오지 않는다).
        ui.onRematchWait();
        break;

      case 'rematch_start':
        session.seq = 0;
        game.resetGame();
        ui.onRematchStart();
        updateInput(session);
        break;

      case 'error':
        session.closedByUs = true;
        ui.onError(msg.code);
        break;
    }
  }

  function updateInput(session) {
    const myTurn = session.game.currentTurn === session.color;
    session.adapter.setInputEnabled(session.game, myTurn);
  }

  function bindLocalMoves(session) {
    session.adapter.onLocalMove(session.game, (move) => {
      move.by = session.color;
      session.seq += 1;
      session.ws.send(JSON.stringify({ type: 'move', move, seq: session.seq }));
      // 여기서 updateInput을 부르면 안 된다. 이 훅은 placeStone이 턴을 넘기기 "전"에
      // 실행되므로 잠금 계산이 한 수 밀린다. 서버가 move를 되돌려줄 때 갱신한다.
      session.adapter.setInputEnabled(session.game, false);
    });
  }
})();
