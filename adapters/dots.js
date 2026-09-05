// 점잇기 어댑터: 서버 프로토콜과 DotsGame 사이를 잇는다.
// 방(DO) 좌석 라벨 'black'/'white'는 오목 기준이라 선공이 'black'이다.
// 점잇기는 빨강이 선공이므로 DO의 'black' 좌석 == 빨강, 'white' 좌석 == 파랑으로 매핑한다.
//
// 리버시와 마찬가지로 "박스를 완성하면 같은 사람이 다시 둔다"는 규칙이 있어
// 다음 턴이 항상 자동 반전은 아니다. room.js는 move.nextTurn이 있으면 그 값을
// 신뢰하도록 확장되어 있으므로, 매 수마다 실제로 확정된 턴을 명시해서 보낸다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  window.OmokboardAdapters.dots = {
    id: 'dots',
    serverChecks: ['turn', 'emptyCell'],

    serialize(game) {
      return {
        hLines: game.hLines,
        vLines: game.vLines,
        boxes: game.boxes,
        scores: game.scores,
        turn: game.turnColor,
      };
    },

    restore(game, state) {
      if (!state) return;
      game.hLines = state.hLines.map((row) => row.slice());
      game.vLines = state.vLines.map((row) => row.slice());
      game.boxes = state.boxes.map((row) => row.slice());
      game.scores = { ...state.scores };
      // state.turn은 multiplayer.js가 서버 turn('black'/'white')으로 덮어써서 넘긴다.
      game.turnColor = state.turn === 'black' ? 'red' : 'blue';
      game.updateUI();
      game.draw();
    },

    applyMove(game, move) {
      game.placeLine(move.line, { remote: true });
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        line: m.line,
        cell: `${m.line.type}-${m.line.r}-${m.line.c}`,
        nextTurn: m.nextTurn,
        state: window.OmokboardAdapters.dots.serialize(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
