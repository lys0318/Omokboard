// 체스 어댑터: 서버 프로토콜과 ChessGame 사이를 잇는다.
// chess.js 라이브러리가 FEN 직렬화를 이미 지원하므로 상태는 FEN 문자열 하나면 충분하다.
// 방(DO)의 좌석 라벨 'black'/'white'는 오목 기준이라 선공이 'black'이다.
// 체스는 흰색이 선공이므로 DO의 'black' 좌석 == 체스의 'w', DO의 'white' 좌석 == 체스의 'b'로 매핑한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.chess = {
    id: 'chess',
    serverChecks: ['turn'], // 체스는 이동한 칸에 상대 기물이 있어도 합법(캡처)이라 칸 점유 검증이 안 맞는다

    serialize(game) {
      return { fen: game.chess.fen() };
    },

    // 서버가 준 상태로 판을 다시 그린다. 승패 판정 없이 DOM만 맞춘다.
    restore(game, state) {
      if (!state) return;
      game.chess.load(state.fen);
      game.lastMove = null;
      game.selected = null;
      game.legalMoves = [];
      game.renderBoard();
      game.updateStatus();
      game.updatePlayerHighlight();
    },

    applyMove(game, move) {
      const result = game.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (!result) return;
      game.lastMove = { from: move.from, to: move.to };
      game.selected = null;
      game.legalMoves = [];
      game.renderBoard();
      game.updateStatus();
      game.updatePlayerHighlight();
      if (game.chess.game_over()) game.handleGameOver();
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        from: m.from,
        to: m.to,
        promotion: m.promotion,
        state: window.OmokboardAdapters.chess.serialize(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
