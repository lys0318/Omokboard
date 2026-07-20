// 오목 어댑터: 서버 프로토콜과 OmokGame 사이를 잇는다.
// 게임 규칙은 건드리지 않고 상태 직렬화/복원/수 적용만 담당한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.omok = {
    id: 'omok',
    serverChecks: ['turn', 'emptyCell'],

    serialize(game) {
      return { board: game.board, turn: game.currentTurn };
    },

    // 서버가 준 상태로 판을 다시 그린다. 승패 판정·소리 없이 DOM만 맞춘다.
    restore(game, state) {
      if (!state) return;
      game.board = state.board.map((row) => row.slice());
      game.currentTurn = state.turn;
      game.renderBoard();
      for (let r = 0; r < game.board.length; r++) {
        for (let c = 0; c < game.board[r].length; c++) {
          const color = game.board[r][c];
          if (!color) continue;
          const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
          if (!cell) continue;
          cell.classList.add('has-stone');
          const stone = document.createElement('div');
          stone.className = `stone ${color}`;
          cell.appendChild(stone);
        }
      }
      game.updateUI();
    },

    applyMove(game, move) {
      game.placeStone(move.row, move.col, { remote: true });
    },

    onLocalMove(game, cb) {
      game.onMoveApplied = (row, col, opts) => {
        if (opts && opts.remote) return; // 원격 수는 되쏘지 않는다
        cb({
          row,
          col,
          cell: `${row},${col}`,
          state: window.OmokboardAdapters.omok.serialize(game),
        });
      };
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
