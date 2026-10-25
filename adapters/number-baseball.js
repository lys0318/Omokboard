// 숫자야구 어댑터: 서버 프로토콜과 BaseballGame 사이를 잇는다.
//
// 다른 게임과 다른 점: 판정은 서버가 한다. 비밀 숫자는 서버에만 있고(room.js의 secrets),
// 클라이언트는 숫자를 정하거나(secret) 부르면(guess) 요청만 보낸다. 서버는 공개 상태와
// 판정 결과만 돌려주고(bb_ready, bb_guess), 게임이 끝났을 때만 양쪽 숫자(secrets)를 공개한다.
// 그래서 move/applyMove 경로는 쓰지 않고 onMessage로 받는다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters['number-baseball'] = {
    id: 'number-baseball',

    // joined(재접속 포함)·rejected·rematch_start: 공개 상태 + 서버 차례 (+ joined면 내 숫자)
    restore(game, state) {
      game.applyOnlineState(state);
    },

    applyMove() { /* 쓰지 않음 — 서버 판정 메시지는 onMessage로 온다 */ },

    onMessage(game, msg) {
      if (msg.type !== 'bb_ready' && msg.type !== 'bb_guess') return;
      game.applyOnlineState({ ...msg.state, turn: msg.turn, reveal: msg.secrets });
    },

    onLocalMove() { /* 페이지 스크립트가 game.hooks.sendSecret/sendGuess를 직접 연결한다 */ },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
      game.render();
    },
  };
})();
