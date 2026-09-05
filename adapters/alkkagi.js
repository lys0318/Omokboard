// 알까기 어댑터: 서버 프로토콜과 AlkkagiGame 사이를 잇는다.
//
// 다른 게임과 달리 한 수(발사)가 즉시 끝나지 않고 물리 시뮬레이션으로
// 여러 프레임에 걸쳐 진행된다. 다행히 시뮬레이션 좌표계가 기기와 무관한
// 고정값(560×560)이고 연산도 순수 결정론적(랜덤 없음)이라, 같은 발사
// 입력(vx,vy)을 상대 클라이언트에서 그대로 재생하면 동일한 결과가 나온다.
// 그래서 상대 화면에도 실제 물리 애니메이션이 재생된다 — 최종 위치만
// 스냅되는 게 아니다. 그래도 부동소수점 오차가 아주 드물게 누적될 수
// 있으니, 발사한 쪽의 최종 상태를 함께 보내 재생이 끝난 뒤 조용히 맞춘다.
//
// 방(DO) 좌석 라벨 'black'/'white'는 오목 기준이라 선공이 'black'이다.
// 알까기는 빨강이 선공이므로 DO의 'black' 좌석 == 빨강, 'white' 좌석 == 파랑으로 매핑한다.
(function () {
  window.OmokboardAdapters = window.OmokboardAdapters || {};

  function serializeState(game) {
    return {
      marbles: game.marbles.map((m) => ({ ...m })),
      obstacles: game.obstacles.map((o) => ({ ...o })),
      variant: game.variant,
      turn: game.turnColor,
    };
  }

  window.OmokboardAdapters.alkkagi = {
    id: 'alkkagi',
    serverChecks: ['turn'],

    serialize: serializeState,

    restore(game, state) {
      if (!state) return;
      game.marbles = state.marbles.map((m) => ({ ...m }));
      game.obstacles = state.obstacles.map((o) => ({ ...o }));
      game.variant = state.variant;
      // state.turn은 multiplayer.js가 서버 turn('black'/'white')으로 덮어써서 넘긴다.
      game.turnColor = state.turn === 'black' ? 'red' : 'blue';
      game.updateCounters();
      game.updateStatus();
      game.updateHighlight();
      game.draw();
    },

    // 다른 게임과 달리 한 수 반영이 즉시 끝나지 않고 물리 재생(수 초)이 필요하다.
    // multiplayer.js는 applyMove가 끝난 뒤 곧바로 입력 잠금을 다시 계산하므로,
    // Promise를 반환해 재생이 실제로 정지할 때까지 그 계산을 미루게 한다
    // (안 그러면 상대 차례로 넘어가기 전 시점의 turnColor로 잠금이 계산돼
    // 내 차례가 와도 드래그가 안 먹는 버그가 생긴다).
    applyMove(game, move) {
      const m = game.marbles[move.marbleIndex];
      if (!m) return;
      m.vx = move.vx;
      m.vy = move.vy;
      game.isSimulating = true;
      return new Promise((resolve) => {
        game.runPhysics(
          { marbleIndex: move.marbleIndex, vx: move.vx, vy: move.vy },
          { remote: true, finalState: move.state, onSettled: resolve }
        );
      });
    },

    onLocalMove(game, cb) {
      game.hooks.afterMove = (m) => cb({
        marbleIndex: m.marbleIndex,
        vx: m.vx,
        vy: m.vy,
        state: serializeState(game),
      });
    },

    setInputEnabled(game, on) {
      game.inputLocked = !on;
    },
  };
})();
