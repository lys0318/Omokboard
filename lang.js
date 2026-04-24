// 오목보드 Language Support (KO / EN)
(function () {
    var T = {
        ko: {
            'nav.omok': '오목', 'nav.c4': '사목', 'nav.reversi': '리버시', 'nav.chess': '체스', 'nav.ak': '알까기',
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
            'reversi.subtitle': '리버시 - 돌을 뒤집어 보드를 차지하세요',
            'rev.black': '흑돌', 'rev.white': '백돌', 'rev.ai.white': 'AI (백돌)',
            'rev.black.turn': '흑돌의 차례입니다', 'rev.white.turn': '백돌의 차례입니다',
            'rev.black.pass': '흑돌은 둘 곳이 없어 차례를 넘깁니다',
            'rev.white.pass': '백돌은 둘 곳이 없어 차례를 넘깁니다',
            'rev.black.win': '흑돌이 승리했습니다!',
            'rev.white.win': '백돌이 승리했습니다!',
            'rev.ai.win': 'AI가 승리했습니다.',
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
            'howto.goal': '목표:', 'howto.flow': '진행:', 'howto.controls': '조작:', 'howto.tip': '팁:',
            'howto.free': '자유 배치:', 'howto.flip': '뒤집기:', 'howto.pass': '패스:', 'howto.pieceValue': '기물 가치:', 'howto.specialMove': '특수 이동:',
            'howto.aiMode': 'AI 모드:', 'howto.elimination': '탈락:',
            'howto.omok.goal.before': '가로·세로·대각선 중 한 방향으로 같은 색 돌',
            'howto.omok.goal.count': '5개',
            'howto.omok.goal.after': '를 먼저 연속으로 놓으면 승리',
            'howto.omok.flow.before': '흑이 먼저 시작하고 번갈아 착수. 각 턴은',
            'howto.omok.flow.time': '30초',
            'howto.omok.flow.after': '제한',
            'howto.omok.controls': '보드의 빈 교차점을 클릭해 돌을 놓으세요',
            'howto.omok.tip': '3·4연속을 만들며 공격하고, 상대의 4연속은 반드시 막으세요',
            'howto.c4.goal.before': '가로·세로·대각선으로 같은 색 돌',
            'howto.c4.goal.count': '4개',
            'howto.c4.goal.after': '를 먼저 연속으로 놓으면 승리',
            'howto.c4.controls': '나무 바둑판 위의 원하는 교차점을 클릭해 돌을 놓으세요',
            'howto.c4.free': '중력 없이 어느 교차점이든 자유롭게 착수할 수 있습니다',
            'howto.c4.tip': '가로·세로·대각선 4개 연속을 동시에 노리면 상대가 막기 어렵습니다',
            'howto.rev.goal': '게임이 끝났을 때 더 많은 돌을 가진 플레이어가 승리합니다',
            'howto.rev.controls': '표시된 착수 가능 칸을 클릭해 돌을 놓으세요',
            'howto.rev.flip': '내 돌로 상대 돌을 직선으로 감싸면 그 사이의 돌이 모두 뒤집힙니다',
            'howto.rev.pass': '둘 수 있는 곳이 없으면 자동으로 차례를 넘깁니다',
            'howto.rev.tip': '모서리 칸은 뒤집히지 않으므로 가능하면 먼저 차지하세요',
            'howto.chess.goal.before': '상대방의 킹을',
            'howto.chess.goal.key': '체크메이트',
            'howto.chess.goal.after': '로 몰면 승리합니다',
            'howto.chess.controls': '기물을 클릭하면 이동 가능한 칸이 표시되고, 이동할 칸을 클릭해 이동합니다',
            'howto.chess.pieceValue': '폰(1) · 나이트/비숍(3) · 룩(5) · 퀸(9) · 킹(무한)',
            'howto.chess.specialMove': '폰 승격은 자동으로 퀸으로 변환됩니다',
            'howto.chess.aiMode': '흰색(당신)이 먼저 두고, 검정(AI)이 응수합니다',
            'howto.ak.goal': '상대방의 구슬 5개를 모두 보드 밖으로 밀어내면 승리합니다',
            'howto.ak.controls.before': '자신의 구슬을 클릭한 뒤',
            'howto.ak.controls.drag': '드래그',
            'howto.ak.controls.after': '하면 반대 방향으로 발사됩니다',
            'howto.ak.elimination': '구슬의 중심이 보드 테두리를 벗어나면 즉시 탈락합니다',
            'howto.ak.aiMode': '빨강(당신)이 먼저 발사하고 파랑(AI)이 응수합니다',
            'howto.ak.tip': '드래그 거리가 길수록 파워가 강해지며, 같은 팀 구슬도 밀 수 있습니다',
            'index.subtitle': '설치 없이 브라우저에서 바로 즐기는 무료 온라인 보드게임',
            'index.omok.desc': '5개를 먼저 연속으로 놓으면 승리',
            'index.c4.desc': '4개를 먼저 연속으로 놓으면 승리',
            'index.reversi.desc': '상대 돌을 뒤집어 더 많이 차지하세요',
            'index.chess.desc': '킹을 체크메이트로 몰면 승리',
            'index.ak.desc': '구슬을 튕겨 상대를 보드 밖으로',
            'index.pvp': 'AI 대전 · 2인 대전', 'index.play': '플레이 →',
        },
        en: {
            'nav.omok': 'Omok', 'nav.c4': 'Connect 4', 'nav.reversi': 'Reversi', 'nav.chess': 'Chess', 'nav.ak': 'Alkkagi',
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
            'reversi.subtitle': 'Reversi - flip discs and control the board',
            'rev.black': 'Black', 'rev.white': 'White', 'rev.ai.white': 'AI (White)',
            'rev.black.turn': "It's Black's turn", 'rev.white.turn': "It's White's turn",
            'rev.black.pass': 'Black has no legal moves and passes',
            'rev.white.pass': 'White has no legal moves and passes',
            'rev.black.win': 'Black wins!',
            'rev.white.win': 'White wins!',
            'rev.ai.win': 'AI wins.',
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
            'howto.goal': 'Goal:', 'howto.flow': 'Flow:', 'howto.controls': 'Controls:', 'howto.tip': 'Tip:',
            'howto.free': 'Free Placement:', 'howto.flip': 'Flipping:', 'howto.pass': 'Pass:', 'howto.pieceValue': 'Piece Values:', 'howto.specialMove': 'Special Move:',
            'howto.aiMode': 'AI Mode:', 'howto.elimination': 'Elimination:',
            'howto.omok.goal.before': 'Place',
            'howto.omok.goal.count': '5 stones',
            'howto.omok.goal.after': ' of the same color in a row horizontally, vertically, or diagonally to win',
            'howto.omok.flow.before': 'Black moves first, then players alternate turns. Each turn has a',
            'howto.omok.flow.time': '30-second',
            'howto.omok.flow.after': 'limit',
            'howto.omok.controls': 'Click an empty intersection on the board to place a stone',
            'howto.omok.tip': 'Build 3- and 4-stone lines to attack, and always block your opponent’s 4-stone line',
            'howto.c4.goal.before': 'Place',
            'howto.c4.goal.count': '4 stones',
            'howto.c4.goal.after': ' of the same color in a row horizontally, vertically, or diagonally to win',
            'howto.c4.controls': 'Click any intersection on the wooden board to place a stone',
            'howto.c4.free': 'There is no gravity, so you can place a stone on any empty intersection',
            'howto.c4.tip': 'Threatening multiple 4-in-a-row lines at once makes it harder for your opponent to block',
            'howto.rev.goal': 'The player with more discs when the game ends wins',
            'howto.rev.controls': 'Click a highlighted legal square to place a disc',
            'howto.rev.flip': 'Trap opponent discs in a straight line between your discs to flip them',
            'howto.rev.pass': 'If a player has no legal moves, their turn passes automatically',
            'howto.rev.tip': 'Corners cannot be flipped, so take them whenever you can',
            'howto.chess.goal.before': 'Put the opponent’s king in',
            'howto.chess.goal.key': 'checkmate',
            'howto.chess.goal.after': ' to win',
            'howto.chess.controls': 'Click a piece to show legal moves, then click a destination square to move it',
            'howto.chess.pieceValue': 'Pawn(1) · Knight/Bishop(3) · Rook(5) · Queen(9) · King(infinite)',
            'howto.chess.specialMove': 'Pawn promotion automatically becomes a queen',
            'howto.chess.aiMode': 'White (you) moves first, and Black (AI) responds',
            'howto.ak.goal': 'Knock all 5 opponent marbles off the board to win',
            'howto.ak.controls.before': 'Click one of your marbles and',
            'howto.ak.controls.drag': 'drag',
            'howto.ak.controls.after': ' to launch it in the opposite direction',
            'howto.ak.elimination': 'A marble is eliminated as soon as its center leaves the board edge',
            'howto.ak.aiMode': 'Red (you) shoots first, and Blue (AI) responds',
            'howto.ak.tip': 'Longer drags create more power, and you can also push your own marbles',
            'index.subtitle': 'Free online board games — play instantly in your browser',
            'index.omok.desc': 'Place 5 in a row to win',
            'index.c4.desc': 'Place 4 in a row to win',
            'index.reversi.desc': 'Flip opponent discs and control the board',
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
        var games = ['omokGame', 'c4Game', 'reversiGame', 'chessGame', 'alkkagiGame'];
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
