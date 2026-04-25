const PIECE_UNICODE = {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

const PIECE_VALUE = { p:100, n:320, b:330, r:500, q:900, k:20000 };

// Piece-square tables (white's perspective; black reads reversed)
const PST = {
    p: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [ 5,  5, 10, 25, 25, 10,  5,  5],
        [ 0,  0,  0, 20, 20,  0,  0,  0],
        [ 5, -5,-10,  0,  0,-10, -5,  5],
        [ 5, 10, 10,-20,-20, 10, 10,  5],
        [ 0,  0,  0,  0,  0,  0,  0,  0]
    ],
    n: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    b: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    r: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [ 0,  0,  0,  5,  5,  0,  0,  0]
    ],
    q: [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [ -5,  0,  5,  5,  5,  5,  0, -5],
        [  0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    k: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [ 20, 20,  0,  0,  0,  0, 20, 20],
        [ 20, 30, 10,  0,  0, 10, 30, 20]
    ]
};

const FILE_MAP = { a:0, b:1, c:2, d:3, e:4, f:5, g:6, h:7 };

class ChessGame {
    constructor() {
        this.chess = new Chess();
        this.gameMode = 'pvp';
        this.difficulty = 'normal';
        this.selected = null;
        this.legalMoves = [];
        this.lastMove = null;
        this.isThinking = false;

        this.boardRowsEl = document.getElementById('chess-board-rows');
        this.statusEl    = document.getElementById('chess-status');
        this.winOverlay  = document.getElementById('chess-win-overlay');
        this.winTitle    = document.getElementById('chess-win-title');
        this.winDesc     = document.getElementById('chess-win-desc');
        this.modeOverlay = document.getElementById('chess-mode-overlay');

        this.renderBoard();
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('chess-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('chess-ai-select-btn').addEventListener('click', () => {
            document.getElementById('chess-step-mode').classList.add('hidden');
            document.getElementById('chess-step-diff').classList.remove('hidden');
        });
        document.getElementById('chess-easy-btn').addEventListener('click',   () => this.startGame('ai', 'easy'));
        document.getElementById('chess-normal-btn').addEventListener('click', () => this.startGame('ai', 'normal'));
        document.getElementById('chess-hard-btn').addEventListener('click',   () => this.startGame('ai', 'hard'));
        document.getElementById('chess-diff-back').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('chess-restart-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('chess-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('chess-step-mode').classList.remove('hidden');
        document.getElementById('chess-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'normal') {
        this.gameMode   = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        this.chess.reset();
        this.selected = null;
        this.legalMoves = [];
        this.lastMove = null;
        this.isThinking = false;
        const blackLabel = document.getElementById('chess-black-label');
        blackLabel.textContent = mode === 'ai' ? window.i18n.t('chess.ai.black') : window.i18n.t('chess.black');
        this.renderBoard();
        this.updateStatus();
        this.updatePlayerHighlight();
    }

    // ─── Rendering ───────────────────────────────────────────

    renderBoard() {
        this.boardRowsEl.innerHTML = '';

        for (let rank = 8; rank >= 1; rank--) {
            const rowWrap = document.createElement('div');
            rowWrap.className = 'chess-row-wrap';

            const rankLabel = document.createElement('span');
            rankLabel.textContent = rank;
            rowWrap.appendChild(rankLabel);

            const row = document.createElement('div');
            row.className = 'chess-board';
            row.style.gridTemplateColumns = 'repeat(8, 1fr)';

            for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
                const file = 'abcdefgh'[fileIdx];
                const sq   = file + rank;
                const isLight = (rank + fileIdx) % 2 === 1;

                const sqEl = document.createElement('div');
                sqEl.className = 'chess-sq ' + (isLight ? 'light' : 'dark');
                sqEl.dataset.sq = sq;

                if (this.lastMove && (sq === this.lastMove.from || sq === this.lastMove.to))
                    sqEl.classList.add('last-move');
                if (this.selected === sq) sqEl.classList.add('selected');
                if (this.legalMoves.includes(sq)) {
                    const piece = this.chess.get(sq);
                    sqEl.classList.add(piece ? 'legal-capture' : 'legal-move');
                }
                if (this.chess.in_check()) {
                    const kingPos = this.findKing(this.chess.turn());
                    if (sq === kingPos) sqEl.classList.add('in-check');
                }

                const piece = this.chess.get(sq);
                if (piece) {
                    const span = document.createElement('span');
                    const key  = piece.color + piece.type.toUpperCase();
                    span.className = 'chess-piece' + (piece.color === 'b' ? ' black-piece' : '');
                    span.textContent = PIECE_UNICODE[key] || '';
                    sqEl.appendChild(span);
                }

                sqEl.addEventListener('click', () => this.handleClick(sq));
                row.appendChild(sqEl);
            }

            rowWrap.appendChild(row);
            const rankLabel2 = document.createElement('span');
            rankLabel2.textContent = rank;
            rowWrap.appendChild(rankLabel2);
            this.boardRowsEl.appendChild(rowWrap);
        }

        this.renderCaptured();
    }

    findKing(color) {
        for (let r = 1; r <= 8; r++) {
            for (const f of 'abcdefgh') {
                const sq = f + r;
                const p  = this.chess.get(sq);
                if (p && p.type === 'k' && p.color === color) return sq;
            }
        }
        return null;
    }

    renderCaptured() {
        const whiteCap = [], blackCap = [];
        for (const move of this.chess.history({ verbose: true })) {
            if (move.captured) {
                const key = (move.color === 'w' ? 'b' : 'w') + move.captured.toUpperCase();
                if (move.color === 'w') whiteCap.push(PIECE_UNICODE[key] || '');
                else blackCap.push(PIECE_UNICODE[key] || '');
            }
        }
        document.getElementById('chess-cap-white').textContent = whiteCap.join(' ');
        document.getElementById('chess-cap-black').textContent = blackCap.join(' ');
    }

    // ─── Click handling ───────────────────────────────────────

    handleClick(sq) {
        if (this.chess.game_over() || this.isThinking) return;
        if (this.gameMode === 'ai' && this.chess.turn() === 'b') return;

        const piece = this.chess.get(sq);

        if (piece && piece.color === this.chess.turn()) {
            this.selected = sq;
            this.legalMoves = this.chess.moves({ square: sq, verbose: true }).map(m => m.to);
            this.renderBoard();
            return;
        }

        if (this.selected) {
            const moves = this.chess.moves({ square: this.selected, verbose: true });
            const move  = moves.find(m => m.to === sq);
            if (move) { this.executeMove(this.selected, sq, move); return; }
        }

        this.selected = null;
        this.legalMoves = [];
        this.renderBoard();
    }

    executeMove(from, to, moveObj) {
        const promotion = moveObj.flags.includes('p') ? 'q' : undefined;
        const result = this.chess.move({ from, to, promotion });
        if (!result) return;

        this.lastMove = { from, to };
        this.selected = null;
        this.legalMoves = [];
        this.renderBoard();
        this.updateStatus();
        this.updatePlayerHighlight();

        if (this.chess.game_over()) { this.handleGameOver(); return; }
        if (this.gameMode === 'ai' && this.chess.turn() === 'b') this.scheduleAI();
    }

    // ─── AI ──────────────────────────────────────────────────

    scheduleAI() {
        this.isThinking = true;
        const delay = this.difficulty === 'easy' ? 600 : this.difficulty === 'hard' ? 150 : 400;
        setTimeout(() => {
            if (this.chess.game_over()) { this.isThinking = false; return; }
            const move = this.getBestMove();
            if (move) {
                this.lastMove = { from: move.from, to: move.to };
                this.chess.move(move);
                this.renderBoard();
                this.updateStatus();
                this.updatePlayerHighlight();
                if (this.chess.game_over()) this.handleGameOver();
            }
            this.isThinking = false;
        }, delay);
    }

    getBestMove() {
        const moves = this.chess.moves({ verbose: true });
        if (!moves.length) return null;

        if (this.difficulty === 'easy') {
            // Easy: pick from worst 60% moves (random but avoids best plays)
            const scored = moves.map(m => {
                this.chess.move(m);
                const s = this.evalBoard();
                this.chess.undo();
                return { m, s };
            }).sort((a, b) => b.s - a.s);
            const pool = scored.slice(Math.floor(scored.length * 0.4));
            return pool[Math.floor(Math.random() * pool.length)].m;
        }

        const depth = this.difficulty === 'hard' ? 3 : 2;
        let best = null, bestScore = -Infinity, alpha = -Infinity;

        const ordered = this.orderMoves(moves);

        for (const move of ordered) {
            this.chess.move(move);
            const score = this.minimax(depth - 1, alpha, Infinity, 1);
            this.chess.undo();
            if (score > bestScore) { bestScore = score; best = move; }
            alpha = Math.max(alpha, bestScore);
        }
        return best;
    }

    minimax(depth, alpha, beta, ply) {
        if (depth === 0 || this.chess.game_over()) return this.evalBoard(ply);

        const moves = this.orderMoves(this.chess.moves({ verbose: true }));
        const maximizing = this.chess.turn() === 'b';

        if (maximizing) {
            let maxScore = -Infinity;
            for (const move of moves) {
                this.chess.move(move);
                maxScore = Math.max(maxScore, this.minimax(depth - 1, alpha, beta, ply + 1));
                this.chess.undo();
                alpha = Math.max(alpha, maxScore);
                if (beta <= alpha) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const move of moves) {
                this.chess.move(move);
                minScore = Math.min(minScore, this.minimax(depth - 1, alpha, beta, ply + 1));
                this.chess.undo();
                beta = Math.min(beta, minScore);
                if (beta <= alpha) break;
            }
            return minScore;
        }
    }

    orderMoves(moves) {
        return [...moves].sort((a, b) => this.moveOrderScore(b) - this.moveOrderScore(a));
    }

    moveOrderScore(move) {
        let score = 0;
        if (move.captured) {
            score += 10000 + (PIECE_VALUE[move.captured] || 0) * 10 - (PIECE_VALUE[move.piece] || 0);
        }
        if (move.flags && move.flags.includes('p')) score += 9000;
        if (move.san && move.san.includes('#')) score += 20000;
        else if (move.san && move.san.includes('+')) score += 2500;
        if (move.to === 'd4' || move.to === 'e4' || move.to === 'd5' || move.to === 'e5') score += 40;
        return score;
    }

    evalBoard(ply = 0) {
        if (this.chess.in_checkmate()) return this.chess.turn() === 'w' ? 100000 - ply : -100000 + ply;
        if (this.chess.in_stalemate() || this.chess.in_threefold_repetition()) return 0;

        let score = 0;
        for (let r = 1; r <= 8; r++) {
            for (const f of 'abcdefgh') {
                const p = this.chess.get(f + r);
                if (!p) continue;
                const val      = PIECE_VALUE[p.type] || 0;
                const fileIdx  = FILE_MAP[f];
                const rankIdx  = p.color === 'w' ? (8 - r) : (r - 1);
                const pst      = PST[p.type];
                const pstVal   = pst ? pst[rankIdx][fileIdx] : 0;
                score += p.color === 'b' ? (val + pstVal) : -(val + pstVal);
            }
        }
        if (this.chess.in_check()) score += this.chess.turn() === 'w' ? 35 : -35;
        const mobility = this.chess.moves().length;
        score += this.chess.turn() === 'b' ? mobility * 2 : -mobility * 2;
        return score;
    }

    // ─── Game over ────────────────────────────────────────────

    handleGameOver() {
        setTimeout(() => {
            let title, desc;
            if (this.chess.in_checkmate()) {
                const winnerIsBlack = this.chess.turn() === 'w';
                const isPlayerWin = this.gameMode !== 'ai' || !winnerIsBlack;
                title = isPlayerWin ? window.i18n.t('game.win') : window.i18n.t('game.lose');
                if (this.gameMode === 'ai') {
                    desc = !winnerIsBlack ? window.i18n.t('chess.you.win') : window.i18n.t('chess.ai.win');
                } else {
                    desc = winnerIsBlack ? window.i18n.t('chess.black.win') : window.i18n.t('chess.white.win');
                }
            } else if (this.chess.in_stalemate()) {
                title = window.i18n.t('chess.stalemate'); desc = window.i18n.t('chess.stalemate.desc');
            } else if (this.chess.in_threefold_repetition()) {
                title = window.i18n.t('game.draw'); desc = window.i18n.t('chess.threefold.desc');
            } else {
                title = window.i18n.t('game.draw'); desc = window.i18n.t('chess.gameover.desc');
            }
            this.winTitle.textContent = title;
            this.winTitle.style.background = '';
            this.winTitle.style.webkitTextFillColor = '';
            this.winDesc.textContent = desc;
            this.winOverlay.classList.remove('hidden');
        }, 500);
    }

    updateStatus() {
        if (this.chess.in_checkmate()) {
            this.statusEl.textContent = window.i18n.t('chess.checkmate');
        } else if (this.chess.in_check()) {
            this.statusEl.textContent = this.chess.turn() === 'w' ? window.i18n.t('chess.check.w') : window.i18n.t('chess.check.b');
        } else if (this.gameMode === 'ai' && this.chess.turn() === 'b') {
            this.statusEl.textContent = window.i18n.t('game.ai.thinking');
        } else {
            this.statusEl.textContent = this.chess.turn() === 'w' ? window.i18n.t('chess.white.turn') : window.i18n.t('chess.black.turn');
        }
    }

    refreshLang() {
        const blackLabel = document.getElementById('chess-black-label');
        if (blackLabel) blackLabel.textContent = this.gameMode === 'ai' ? window.i18n.t('chess.ai.black') : window.i18n.t('chess.black');
        if (!this.isGameOver) this.updateStatus();
    }

    updatePlayerHighlight() {
        document.getElementById('chess-player-white').classList.toggle('active', this.chess.turn() === 'w');
        document.getElementById('chess-player-black').classList.toggle('active', this.chess.turn() === 'b');
    }
}

window.chessGame = new ChessGame();
