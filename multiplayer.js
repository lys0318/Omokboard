// 온라인 방 대전 클라이언트. 게임 로직은 어댑터에 위임한다.
(function () {
  const GRACE_MS = 120000;
  const BACKOFF = [1000, 2000, 4000, 8000, 15000];

  function tokenKey(code) {
    return `omokboard.room.${code}`;
  }

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
    localStorage.setItem(tokenKey(data.code), data.token);
    session.ui.onCode(data.code, shareUrl(data.code));
    connect(session);
  }

  function shareUrl(code) {
    return `${location.origin}${location.pathname}?room=${code}`;
  }

  function connect(session) {
    const token = localStorage.getItem(tokenKey(session.code)) || '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/room/${session.code}${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(url);
    session.ws = ws;

    ws.addEventListener('open', () => {
      session.attempt = 0;
      session.ui.onStatus('connected');
    });

    ws.addEventListener('message', (e) => handle(session, JSON.parse(e.data)));

    ws.addEventListener('close', () => {
      if (session.closedByUs) return;
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
        if (msg.token) localStorage.setItem(tokenKey(session.code), msg.token);
        if (msg.state) adapter.restore(game, msg.state);
        bindLocalMoves(session);
        ui.onCode(session.code, shareUrl(session.code));
        ui.onStatus(msg.status, { color: msg.color });
        updateInput(session);
        break;

      case 'move':
        session.seq = msg.seq;
        // 내가 둔 수가 되돌아온 경우엔 이미 화면에 반영돼 있다.
        if (msg.move && msg.move.by !== session.color) {
          adapter.applyMove(game, msg.move);
        }
        updateInput(session);
        break;

      case 'rejected':
        // 서버가 권위. 받은 상태로 되돌린다.
        session.seq = msg.seq;
        adapter.restore(game, msg.state);
        updateInput(session);
        ui.onError(msg.reason);
        break;

      case 'opponent':
        ui.onStatus(msg.event === 'left' ? 'opponent_left' : 'opponent_back');
        break;

      case 'status':
        ui.onStatus(msg.status, msg);
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
      updateInput(session);
    });
  }
})();
