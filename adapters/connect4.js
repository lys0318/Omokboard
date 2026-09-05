// 사목 어댑터: 서버 프로토콜과 Connect4 사이를 잇는다.
// 방(DO) 좌석 라벨 'black'/'white'는 오목 기준이라 선공이 'black'이다.
// 사목은 빨강이 선공이므로 DO의 'black' 좌석 == 사목의 red, 'white' 좌석 == yellow로 매핑한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.connect4 = {
    id: 'connect4',
    serverChecks: ['turn', 'emptyCell'],

    serialize(game) {
      return { board: game.board, turn: game.turnColor };
    },

    restore(game, state) {
      if (!state) return;
      game.board = state.board.map((row) => row.slice());
      // state.turn은 multiplayer.js가 서버 turn('black'/'white')으로 덮어써서 넘긴다.
      game.turnColor = state.turn === 'black' ? 'red' : 'yellow';
      game.updateStatus();
      game.updateHighlight();
      game.draw();
    },

    applyMove(game, move) {
      game.placePiece(move.row, move.col, { remote: true });
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        row: m.row,
        col: m.col,
        cell: `${m.row},${m.col}`,
        state: window.OmokboardAdapters.connect4.serialize(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
