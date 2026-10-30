// 딱지치기 어댑터: 서버 프로토콜과 TtakjiGame 사이를 잇는다.
//
// 윷놀이와 같은 방식: 난수만 서버가 정한다. 내 차례에 치면 위치·세기를 hit로 보내고,
// 서버가 난수(roll)를 붙여 양쪽에 돌려주면(onMessage) 두 브라우저가 같은 식으로 결과를 계산한다.
// 연출이 끝나면 친 쪽이 확정 상태 { counts, k }와 다음 차례를 move로 보낸다.
// 좌석: 'black' = 빨강(방장, 첫 판 선공), 'white' = 파랑.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.ttakji = {
    id: 'ttakji',

    // joined(재접속 포함)·rejected·rematch_start: 확정 상태 + 서버 차례
    restore(game, state) {
      game.applyOnlineState(state);
    },

    // 상대의 move. 내 화면 연출이 아직 끝나지 않았으면 끝난 뒤에 맞춘다(Promise를 돌려주면 multiplayer.js가 기다린다)
    applyMove(game, move) {
      return game.whenIdle().then(() => game.applyOnlineState({ ...move.state, turn: move.nextTurn }));
    },

    onMessage(game, msg) {
      if (msg.type !== 'hit') return;
      game.play({ by: msg.by, x: msg.x, y: msg.y, power: msg.power, roll: msg.roll });
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = cb;
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
      game.render();
    },
  };
})();
