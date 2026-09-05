// 얼티메이트 틱택토 어댑터: 서버 프로토콜과 UltimateTTT 사이를 잇는다.
// 클래식 3×3과는 별개 게임 엔진이라 어댑터도 분리한다.
// 방(DO) 좌석 라벨 'black'/'white'는 오목 기준이라 선공이 'black'이다.
// 얼티메이트도 X가 선공이므로 DO의 'black' 좌석 == X, 'white' 좌석 == O로 매핑한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.ultimate = {
    id: 'ultimate',
    serverChecks: ['turn', 'emptyCell'],

    serialize(game) {
      return {
        boards: game.boards,
        boardWinner: game.boardWinner,
        activeBoard: game.activeBoard,
        turn: game.current,
      };
    },

    restore(game, state) {
      if (!state) return;
      game.boards = state.boards.map((b) => b.slice());
      game.boardWinner = state.boardWinner.slice();
      game.activeBoard = state.activeBoard;
      // state.turn은 multiplayer.js가 서버 turn('black'/'white')으로 덮어써서 넘긴다.
      game.current = state.turn === 'black' ? 'X' : 'O';
      game.render();
      game.updateStatus();
    },

    applyMove(game, move) {
      const player = game.current;
      game.play(move.sb, move.c, player, { remote: true });
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        sb: m.sb,
        c: m.c,
        cell: `${m.sb}-${m.c}`,
        state: window.OmokboardAdapters.ultimate.serialize(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
