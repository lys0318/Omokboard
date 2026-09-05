// 틱택토(클래식 3×3) 어댑터: 서버 프로토콜과 TicTacToe 사이를 잇는다.
// 얼티메이트 변형은 완전히 다른 게임 로직이라 이번 범위에 포함하지 않는다.
// 방(DO) 좌석 라벨 'black'/'white'는 오목 기준이라 선공이 'black'이다.
// 틱택토는 X가 선공이므로 DO의 'black' 좌석 == X, 'white' 좌석 == O로 매핑한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.tictactoe = {
    id: 'tictactoe',
    serverChecks: ['turn', 'emptyCell'],

    serialize(game) {
      return { board: game.board, turn: game.turnColor };
    },

    restore(game, state) {
      if (!state) return;
      game.board = state.board.slice();
      // state.turn은 multiplayer.js가 서버 turn('black'/'white')으로 덮어써서 넘긴다.
      game.turnColor = state.turn === 'black' ? 'X' : 'O';
      game.render();
      game.updateStatus();
    },

    applyMove(game, move) {
      const player = game.turnColor;
      game.place(move.cell, player, { remote: true });
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        cell: m.cell,
        state: window.OmokboardAdapters.tictactoe.serialize(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
