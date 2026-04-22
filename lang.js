// 오목보드 Language Support (KO / EN)
(function () {
    var T = {
        ko: {
            'nav.omok': '오목', 'nav.c4': '사목', 'nav.chess': '체스', 'nav.ak': '알까기',
            'lang.btn': 'EN',
            'btn.restart': '게임 재시작', 'btn.back': '← 뒤로', 'btn.replay': '다시 하기',
            'mode.select': '게임 모드를 선택하세요',
            'mode.pvp': '1:1 하기', 'mode.pvp.desc': '친구와 대결',
            'mode.ai': 'AI 대전', 'mode.ai.desc': 'AI와 대결',
            'mode.diff': '난이도를 선택하세요',
            'mode.easy': '쉬움', 'mode.easy.desc': '가볍게 즐기기',
            'mode.normal': '보통', 'mode.normal.desc': '적당한 도전',
            'mode.hard': '어려움', 'mode.hard.desc': '실력 발휘', 'mode.hard.ak': '정밀 조준',
            'game.win': '승리!', 'game.lose': '패배...', 'game.draw': '무승부',
            'game.draw.msg': '무승부입니다!', 'game.draw.full': '보드가 가득 찼습니다.',
            'game.ai.thinking': 'AI 생각중...', 'game.close': '치열한 승부였네요.',
            'omok.black': '흑돌 (Black)', 'omok.white': '백돌 (White)',
            'omok.black.turn': '흑의 차례입니다', 'omok.white.turn': '백의 차례입니다',
            'omok.you.win': '당신이 승리했습니다.', 'omok.ai.win': 'AI가 승리했습니다.',
            'omok.black.win': '흑돌이 승리했습니다.', 'omok.white.win': '백돌이 승리했습니다.',
            'c4.red': '빨강 (Red)', 'c4.yellow': '노랑 (Yellow)',
            'c4.red.turn': '빨강의 차례입니다', 'c4.yellow.turn': '노랑의 차례입니다',
            'c4.you': '당신', 'c4.ai': 'AI', 'c4.red.n': '빨강', 'c4.yellow.n': '노랑',
            'chess.white': '흰색 (White)', 'chess.black': '검정 (Black)',
            'chess.ai.black': 'AI (Black)',
            'chess.white.turn': '흰색의 차례입니다', 'chess.black.turn': '검정의 차례입니다',
            'chess.checkmate': '체크메이트!',
            'chess.check.w': '흰색 체크!', 'chess.check.b': '검정 체크!',
            'chess.you.win': '당신이 승리했습니다!', 'chess.ai.win': 'AI가 승리했습니다.',
            'chess.white.win': '흰색이 체크메이트! 승리했습니다.',
            'chess.black.win': '검정이 체크메이트! 승리했습니다.',
            'chess.stalemate': '스테일메이트',
            'chess.stalemate.desc': '움직일 수 있는 수가 없습니다. 무승부!',
            'chess.threefold.desc': '같은 국면이 3번 반복되었습니다.',
            'chess.gameover.desc': '게임이 끝났습니다.',
            'ak.red': '빨강', 'ak.blue': '파랑', 'ak.ai.blue': 'AI (파랑)',
            'ak.red.turn': '빨강의 차례입니다', 'ak.blue.turn': '파랑의 차례입니다',
            'ak.you.win': '당신이 상대 구슬을 모두 밀어냈습니다!',
            'ak.ai.win': 'AI가 당신의 구슬을 모두 밀어냈습니다.',
            'ak.red.win': '빨강이 상대 구슬을 모두 밀어냈습니다!',
            'ak.blue.win': '파랑이 상대 구슬을 모두 밀어냈습니다!',
            'footer.home': '홈', 'footer.about': '게임 소개', 'footer.privacy': '개인정보처리방침',
            'footer.copy': '© 2025 오목보드. All rights reserved.',
            'howto.title': '게임 방법',
            'index.subtitle': '설치 없이 브라우저에서 바로 즐기는 무료 온라인 보드게임',
            'index.omok.desc': '5개를 먼저 연속으로 놓으면 승리',
            'index.c4.desc': '4개를 먼저 연속으로 놓으면 승리',
            'index.chess.desc': '킹을 체크메이트로 몰면 승리',
            'index.ak.desc': '구슬을 튕겨 상대를 보드 밖으로',
            'index.pvp': 'AI 대전 · 2인 대전', 'index.play': '플레이 →',
        },
        en: {
            'nav.omok': 'Omok', 'nav.c4': 'Connect 4', 'nav.chess': 'Chess', 'nav.ak': 'Alkkagi',
            'lang.btn': '한국어',
            'btn.restart': 'Restart', 'btn.back': '← Back', 'btn.replay': 'Play Again',
            'mode.select': 'Select Game Mode',
            'mode.pvp': '2 Players', 'mode.pvp.desc': 'Play with a friend',
            'mode.ai': 'vs AI', 'mode.ai.desc': 'Play against AI',
            'mode.diff': 'Select Difficulty',
            'mode.easy': 'Easy', 'mode.easy.desc': 'Casual play',
            'mode.normal': 'Normal', 'mode.normal.desc': 'Moderate challenge',
            'mode.hard': 'Hard', 'mode.hard.desc': 'Show your skills', 'mode.hard.ak': 'Precise aiming',
            'game.win': 'Victory!', 'game.lose': 'Defeat...', 'game.draw': 'Draw',
            'game.draw.msg': "It's a draw!", 'game.draw.full': 'The board is full.',
            'game.ai.thinking': 'AI is thinking...', 'game.close': 'What a close match!',
            'omok.black': 'Black', 'omok.white': 'White',
            'omok.black.turn': "It's Black's turn", 'omok.white.turn': "It's White's turn",
            'omok.you.win': 'You win!', 'omok.ai.win': 'AI wins.',
            'omok.black.win': 'Black wins!', 'omok.white.win': 'White wins!',
            'c4.red': 'Red', 'c4.yellow': 'Yellow',
            'c4.red.turn': "It's Red's turn", 'c4.yellow.turn': "It's Yellow's turn",
            'c4.you': 'You', 'c4.ai': 'AI', 'c4.red.n': 'Red', 'c4.yellow.n': 'Yellow',
            'chess.white': 'White', 'chess.black': 'Black',
            'chess.ai.black': 'AI (Black)',
            'chess.white.turn': "It's White's turn", 'chess.black.turn': "It's Black's turn",
            'chess.checkmate': 'Checkmate!',
            'chess.check.w': 'White in check!', 'chess.check.b': 'Black in check!',
            'chess.you.win': 'You win!', 'chess.ai.win': 'AI wins.',
            'chess.white.win': 'White checkmate! Wins.',
            'chess.black.win': 'Black checkmate! Wins.',
            'chess.stalemate': 'Stalemate',
            'chess.stalemate.desc': 'No legal moves. Draw!',
            'chess.threefold.desc': 'Position repeated 3 times.',
            'chess.gameover.desc': 'Game over.',
            'ak.red': 'Red', 'ak.blue': 'Blue', 'ak.ai.blue': 'AI (Blue)',
            'ak.red.turn': "It's Red's turn", 'ak.blue.turn': "It's Blue's turn",
            'ak.you.win': 'You knocked out all opponent marbles!',
            'ak.ai.win': 'AI knocked out all your marbles.',
            'ak.red.win': 'Red knocked out all opponent marbles!',
            'ak.blue.win': 'Blue knocked out all opponent marbles!',
            'footer.home': 'Home', 'footer.about': 'About', 'footer.privacy': 'Privacy Policy',
            'footer.copy': '© 2025 Omokboard. All rights reserved.',
            'howto.title': 'How to Play',
            'index.subtitle': 'Free online board games — play instantly in your browser',
            'index.omok.desc': 'Place 5 in a row to win',
            'index.c4.desc': 'Place 4 in a row to win',
            'index.chess.desc': 'Checkmate the King to win',
            'index.ak.desc': 'Flick marbles off the board',
            'index.pvp': 'vs AI · 2 Players', 'index.play': 'Play →',
        }
    };

    var lang = localStorage.getItem('omokboard-lang') || 'ko';

    function t(key) {
        return (T[lang] && T[lang][key]) || (T.ko && T.ko[key]) || key;
    }

    function getLang() { return lang; }

    function applyLang() {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var val = t(key);
            if (val) el.textContent = val;
        });
        document.querySelectorAll('.ko-only').forEach(function (el) {
            el.style.display = lang === 'ko' ? '' : 'none';
        });
        document.querySelectorAll('.en-only').forEach(function (el) {
            el.style.display = lang === 'en' ? '' : 'none';
        });
        var btn = document.getElementById('lang-toggle');
        if (btn) btn.textContent = t('lang.btn');
        document.documentElement.lang = lang === 'en' ? 'en' : 'ko';
        // Notify running games to re-render text
        var games = ['omokGame', 'c4Game', 'chessGame', 'alkkagiGame'];
        games.forEach(function (g) {
            if (window[g] && typeof window[g].refreshLang === 'function') window[g].refreshLang();
        });
    }

    function toggleLang() {
        lang = lang === 'ko' ? 'en' : 'ko';
        localStorage.setItem('omokboard-lang', lang);
        applyLang();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyLang);
    } else {
        applyLang();
    }

    window.i18n = { t: t, getLang: getLang, toggleLang: toggleLang, applyLang: applyLang };
    window.toggleLang = toggleLang;
})();
