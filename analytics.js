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

/* 게임 종료 모달에 "다른 게임 추천" 주입 — 리텐션(세션·광고노출↑).
   게임별 HTML 비침투: .modal(결과 모달)에 무작위 3게임 링크 append. */
(function () {
  var GAMES = {
    omok: { ko: '오목', en: 'Omok' }, connect4: { ko: '사목', en: 'Connect 4' },
    reversi: { ko: '리버시', en: 'Reversi' }, dots: { ko: '점잇기', en: 'Dots & Boxes' },
    chess: { ko: '체스', en: 'Chess' }, alkkagi: { ko: '알까기', en: 'Alkkagi' },
    yut: { ko: '윷놀이', en: 'Yut Nori' }, sudoku: { ko: '스도쿠', en: 'Sudoku' },
    tictactoe: { ko: '틱택토', en: 'Tic-Tac-Toe' }, minesweeper: { ko: '지뢰찾기', en: 'Minesweeper' },
    '2048': { ko: '2048', en: '2048' }, ladder: { ko: '사다리타기', en: 'Ladder' }
  };
  var isEn = document.documentElement.lang === 'en';
  var lang = isEn ? 'en' : 'ko';
  var base = isEn ? '/en/' : '/';
  var path = location.pathname.replace(/^\/en\//, '/').replace(/^\//, '').replace(/\.html$/, '');
  if (!GAMES[path]) return; // 게임 플레이 페이지에서만

  var others = Object.keys(GAMES).filter(function (s) { return s !== path; });
  for (var i = others.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = others[i]; others[i] = others[j]; others[j] = t; }
  var pick = others.slice(0, 3);
  var label = isEn ? 'Try another game' : '다른 게임 해보기';

  function inject() {
    var modals = document.querySelectorAll('.modal');
    for (var k = 0; k < modals.length; k++) {
      var m = modals[k];
      if (m.querySelector('.related-games')) continue;                 // 중복 방지
      if (!m.querySelector('[data-i18n="btn.replay"],[id*="reset"]')) continue; // 결과 모달만
      var box = document.createElement('div');
      box.className = 'related-games';
      box.style.cssText = 'margin-top:1.25rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.12);';
      var h = document.createElement('div');
      h.textContent = label;
      h.style.cssText = 'font-size:0.85rem;color:var(--text-muted,#94a3b8);margin-bottom:0.6rem;';
      box.appendChild(h);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;';
      pick.forEach(function (s) {
        var a = document.createElement('a');
        a.href = base + s;
        a.textContent = GAMES[s][lang];
        a.style.cssText = 'display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;border:1px solid rgba(255,255,255,0.15);border-radius:0.5rem;color:var(--text-main,#f8fafc);text-decoration:none;font-size:0.9rem;font-weight:600;background:rgba(255,255,255,0.05);';
        row.appendChild(a);
      });
      box.appendChild(row);
      m.appendChild(box);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
