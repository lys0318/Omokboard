// 윷놀이 어댑터: 서버 프로토콜과 YutGame 사이를 잇는다.
//
// 다른 게임과 두 가지가 다르다.
// 1) 난수: 윷 던지기는 클라이언트가 뽑으면 조작할 수 있어서, 서버가 윷가락
//    4개의 앞뒤만 뽑아 양쪽에 뿌린다(room.js의 throw 메시지). 도·개·걸·윷·모·
//    빽도 해석과 이동 규칙은 다른 게임처럼 클라이언트가 그대로 처리한다.
// 2) 한 턴에 여러 행동: 윷/모가 나오면 또 던지고, 말을 잡아도 또 던지고,
//    쌓인 결과 수만큼 말을 옮긴다. 그래서 "1수 = 1턴"이 아니다. 행동이 끝난
//    시점의 판 상태를 통째로 보내고 받는 쪽은 그대로 반영한다(규칙 재계산 없이) —
//    턴이 넘어가는지는 move.nextTurn으로 명시한다(리버시·점잇기와 같은 방식).
//
// 방(DO) 좌석 라벨 'black'/'white'는 오목 기준이라 선공이 'black'이다.
// 윷놀이는 p1(빨강)이 선공이므로 'black' 좌석 == p1, 'white' 좌석 == p2로 매핑한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  function serializeState(game) {
    return {
      players: {
        p1: { color: game.players.p1.color, tokens: game.players.p1.tokens.slice(), done: game.players.p1.done },
        p2: { color: game.players.p2.color, tokens: game.players.p2.tokens.slice(), done: game.players.p2.done },
      },
      results: game.results.map((r) => ({ ...r })),
      canThrow: game.canThrow,
      phase: game.phase,
      turn: game.current === 'p1' ? 'black' : 'white',
    };
  }

  function applyState(game, state) {
    if (!state) return;
    game.players.p1 = { color: 'red', tokens: state.players.p1.tokens.slice(), done: state.players.p1.done };
    game.players.p2 = { color: 'blue', tokens: state.players.p2.tokens.slice(), done: state.players.p2.done };
    game.results = (state.results || []).map((r) => ({ ...r }));
    game.canThrow = state.canThrow;
    game.phase = state.phase;
    // state.turn은 multiplayer.js가 서버 turn('black'/'white')으로 덮어써서 넘긴다.
    game.current = state.turn === 'black' ? 'p1' : 'p2';
    // 상대가 고르던 중간 선택은 내 화면에 남기지 않는다.
    game.selectedToken = null;
    game.destOptions = [];
    game.updateGlow();
    game.draw();
    game.updateStatus();
    game.updateThrowBtn();
    // 받은 쪽에서도 완주 판정을 해줘야 승리 화면이 뜬다(보낸 쪽은 이미 처리됨).
    if (!game.isGameOver) game.checkWin();
  }

  window.OmokboardAdapters.yut = {
    id: 'yut',
    serverChecks: ['turn'],

    serialize: serializeState,
    restore: applyState,

    applyMove(game, move) {
      applyState(game, move.state);
    },

    // 서버가 뽑아준 윷가락. 양쪽 다 반영해서 던진 결과를 같이 본다.
    // mine이면(내 차례면) 움직일 말이 없어 턴이 끝나는 경우 상대에게 알려야 한다.
    applyThrow(game, sticks, mine) {
      game.applyServerThrow(sticks, mine);
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        nextTurn: m.nextTurn,
        state: serializeState(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
      game.updateThrowBtn();
      game.updateGlow();
      game.updateStatus();
      game.draw();
    },
  };
})();
