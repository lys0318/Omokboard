// 리버시 어댑터: 서버 프로토콜과 ReversiGame 사이를 잇는다.
// 리버시는 이미 내부 색상이 'black'/'white'라 방(DO) 좌석 라벨과 그대로 일치한다.
//
// 주의: 리버시는 "둘 곳이 없으면 패스, 같은 사람이 다시 둔다"는 규칙이 있어
// 다음 턴이 항상 자동 반전은 아니다. room.js는 move.nextTurn이 있으면 그 값을
// 신뢰하도록 확장되어 있으므로, 매 수마다 실제로 확정된 턴을 명시해서 보낸다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.reversi = {
    id: 'reversi',
    serverChecks: ['turn', 'emptyCell'],

    serialize(game) {
      return { board: game.board, turn: game.currentTurn };
    },

    restore(game, state) {
      if (!state) return;
      game.board = state.board.map((row) => row.slice());
      game.currentTurn = state.turn;
      game.updateUI();
      game.draw();
    },

    applyMove(game, move) {
      game.placeStone(move.row, move.col, { remote: true });
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        row: m.row,
        col: m.col,
        cell: `${m.row},${m.col}`,
        nextTurn: m.nextTurn,
        state: window.OmokboardAdapters.reversi.serialize(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
