/* omokboard 게임 참여 트래킹 (GA4)
   게임 로직을 건드리지 않는 이벤트 위임 방식. 전 게임 페이지 공용.
   이벤트: game_started(첫 플레이 상호작용), mode_selected, difficulty_selected, game_reset.
   승패 결과(win/lose)는 게임별 로직 훅이 필요 — 여기서는 다루지 않음(후속 작업). */
(function () {
  if (typeof window.gtag !== 'function') return;

  var path = location.pathname;
  var lang = path.indexOf('/en/') === 0 ? 'en' : 'ko';
  var slug = path.replace(/^\/en\//, '/').replace(/^\//, '').replace(/\.html$/, '');
  var game = slug === '' ? 'home' : slug;

  function track(name, params) {
    params = params || {};
    params.game = game;
    params.lang = lang;
    window.gtag('event', name, params);
  }

  // 홈/가이드 등 플레이 영역 없는 페이지는 참여 트래킹 생략(오탐 방지)
  var hasPlay = game !== 'home' && game.indexOf('guide') === -1 && game !== 'guides' &&
                game !== 'about' && game !== 'contact' && game !== 'privacy';

  if (hasPlay) {
    // 1) game_started: 플레이 영역 첫 상호작용 시 1회
    var started = false;
    var PLAY = 'canvas,[id*="board"],[class*="board"],[id*="canvas"],[class*="grid"],[class*="cell"]';

    function fireStart() {
      if (started) return;
      started = true;
      track('game_started');
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    }
    function onPointer(e) {
      var t = e.target;
      if (t && t.closest && t.closest(PLAY)) fireStart();
    }
    function onKey(e) {
      // 2048 등 방향키/WASD 조작 게임
      if (/^Arrow/.test(e.key) || /^[wasd]$/i.test(e.key)) fireStart();
    }
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
  }

  // 2) 컨트롤 클릭(모드/난이도/재시작) — id+텍스트 휴리스틱. 전 페이지 적용.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button,[role="button"],.mode-card,.play-badge,.diff-btn');
    if (!b) return;
    var s = ((b.id || '') + ' ' + (b.textContent || '')).toLowerCase();
    var label = (b.textContent || '').trim().slice(0, 30);
    if (/diffic|난이도|쉬움|보통|어려움|easy|normal|hard/.test(s)) {
      track('difficulty_selected', { label: label });
    } else if (/reset|restart|다시\s*하기|재시작|리셋|replay/.test(s)) {
      track('game_reset');
    } else if (/\bai\b|2인|1:1|vs|대전|모드|\bmode\b/.test(s)) {
      track('mode_selected', { label: label });
    }
  }, true);
})();

/* 셀프체크(수동): 콘솔에서 아래로 이벤트 발화 확인 가능
   window.gtag = (...a)=>console.log('GA', a); 후 보드 클릭 → ['event','game_started',{game,lang}] 출력 */
