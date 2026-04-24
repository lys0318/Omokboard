class ReversiGame {
    constructor() {
        this.SIZE = 8;
        this.board = this.emptyBoard();
        this.currentTurn = 'black';
        this.gameMode = 'pvp';
        this.difficulty = 'normal';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.hoverMove = null;
        this.passMessage = '';

        this.weights = [
            [120, -25, 20,  5,  5, 20, -25, 120],
            [-25, -45, -5, -5, -5, -5, -45, -25],
            [ 20,  -5, 15,  3,  3, 15,  -5,  20],
            [  5,  -5,  3,  3,  3,  3,  -5,   5],
            [  5,  -5,  3,  3,  3,  3,  -5,   5],
            [ 20,  -5, 15,  3,  3, 15,  -5,  20],
            [-25, -45, -5, -5, -5, -5, -45, -25],
            [120, -25, 20,  5,  5, 20, -25, 120]
        ];

        this.canvas = document.getElementById('reversi-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.statusEl = document.getElementById('rev-status');
        this.blackCountEl = document.getElementById('rev-black-count');
        this.whiteCountEl = document.getElementById('rev-white-count');
        this.blackPlayerEl = document.getElementById('rev-player-black');
        this.whitePlayerEl = document.getElementById('rev-player-white');
        this.whiteLabelEl = document.getElementById('rev-white-label');
        this.modeOverlay = document.getElementById('rev-mode-overlay');
        this.winOverlay = document.getElementById('rev-win-overlay');
        this.winTitle = document.getElementById('rev-win-title');
        this.winDesc = document.getElementById('rev-win-desc');

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
    }

    emptyBoard() {
        return Array.from({ length: this.SIZE }, () => Array(this.SIZE).fill(null));
    }

    get opponent() {
        return this.currentTurn === 'black' ? 'white' : 'black';
    }

    get boardPad() {
        return 16;
    }

    get cellSize() {
        return Math.floor((this.W - this.boardPad * 2) / this.SIZE);
    }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 520);
        this.W = maxW;
        this.H = maxW;
        this.canvas.width = this.W;
        this.canvas.height = this.H;
        this.draw();
    }

    bindEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
            return {
                x: (src.clientX - rect.left) * (this.canvas.width / rect.width),
                y: (src.clientY - rect.top) * (this.canvas.height / rect.height)
            };
        };

        this.canvas.addEventListener('click', (e) => {
            if (this.isGameOver || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'white') return;
            const cell = this.getCell(getPos(e));
            if (cell) this.placeStone(cell.r, cell.c);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isGameOver || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'white') return;
            this.hoverMove = this.getCell(getPos(e));
            this.draw();
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverMove = null;
            this.draw();
        });

        this.canvas.addEventListener('touchstart', (e) => {
            this.hoverMove = this.getCell(getPos(e));
            this.draw();
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (this.isGameOver || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'white') return;
            const cell = this.getCell(getPos(e));
            if (cell) this.placeStone(cell.r, cell.c);
            this.hoverMove = null;
            e.preventDefault();
        }, { passive: false });

        document.getElementById('rev-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('rev-ai-select-btn').addEventListener('click', () => {
            document.getElementById('rev-step-mode').classList.add('hidden');
            document.getElementById('rev-step-diff').classList.remove('hidden');
        });
        document.getElementById('rev-easy-btn').addEventListener('click', () => this.startGame('ai', 'easy'));
        document.getElementById('rev-normal-btn').addEventListener('click', () => this.startGame('ai', 'normal'));
        document.getElementById('rev-hard-btn').addEventListener('click', () => this.startGame('ai', 'hard'));
        document.getElementById('rev-diff-back').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        document.getElementById('rev-restart-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('rev-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('rev-step-mode').classList.remove('hidden');
        document.getElementById('rev-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'normal') {
        this.gameMode = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        this.whiteLabelEl.textContent = mode === 'ai' ? window.i18n.t('rev.ai.white') : window.i18n.t('rev.white');
        this.reset();
    }

    reset() {
        this.board = this.emptyBoard();
        this.board[3][3] = 'white';
        this.board[3][4] = 'black';
        this.board[4][3] = 'black';
        this.board[4][4] = 'white';
        this.currentTurn = 'black';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.hoverMove = null;
        this.passMessage = '';
        this.updateUI();
        this.draw();
    }

    getCell(pos) {
        const cs = this.cellSize;
        const r = Math.floor((pos.y - this.boardPad) / cs);
        const c = Math.floor((pos.x - this.boardPad) / cs);
        if (r < 0 || r >= this.SIZE || c < 0 || c >= this.SIZE) return null;
        return { r, c };
    }

    inBounds(r, c) {
        return r >= 0 && r < this.SIZE && c >= 0 && c < this.SIZE;
    }

    getFlips(row, col, player, board = this.board) {
        if (board[row][col]) return [];
        const other = player === 'black' ? 'white' : 'black';
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        const flips = [];

        for (const [dr, dc] of dirs) {
            const line = [];
            let r = row + dr;
            let c = col + dc;

            while (this.inBounds(r, c) && board[r][c] === other) {
                line.push({ r, c });
                r += dr;
                c += dc;
            }

            if (line.length && this.inBounds(r, c) && board[r][c] === player) {
                flips.push(...line);
            }
        }

        return flips;
    }

    getValidMoves(player, board = this.board) {
        const moves = [];
        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                const flips = this.getFlips(r, c, player, board);
                if (flips.length) moves.push({ r, c, flips });
            }
        }
        return moves;
    }

    placeStone(row, col) {
        const flips = this.getFlips(row, col, this.currentTurn);
        if (!flips.length) return;

        this.board[row][col] = this.currentTurn;
        flips.forEach(({ r, c }) => {
            this.board[r][c] = this.currentTurn;
        });
        this.passMessage = '';
        this.hoverMove = null;
        this.afterMove();
    }

    afterMove() {
        const justMoved = this.currentTurn;
        const next = justMoved === 'black' ? 'white' : 'black';
        const nextMoves = this.getValidMoves(next);
        const currentMoves = this.getValidMoves(justMoved);

        if (nextMoves.length) {
            this.currentTurn = next;
        } else if (currentMoves.length) {
            this.currentTurn = justMoved;
            this.passMessage = next === 'black' ? window.i18n.t('rev.black.pass') : window.i18n.t('rev.white.pass');
        } else {
            this.handleGameOver();
            return;
        }

        this.updateUI();
        this.draw();

        if (this.gameMode === 'ai' && this.currentTurn === 'white') {
            this.scheduleAI();
        }
    }

    scheduleAI() {
        this.isAIThinking = true;
        this.updateUI();
        const delay = this.difficulty === 'easy' ? 700 : this.difficulty === 'hard' ? 220 : 420;
        setTimeout(() => {
            if (this.isGameOver) {
                this.isAIThinking = false;
                return;
            }
            const move = this.getBestMove();
            this.isAIThinking = false;
            if (move) this.placeStone(move.r, move.c);
            else this.afterMove();
        }, delay);
    }

    getBestMove() {
        const moves = this.getValidMoves('white');
        if (!moves.length) return null;

        if (this.difficulty === 'easy') {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        const scored = moves.map((move) => {
            const score = this.scoreMove(move);
            return { ...move, score };
        }).sort((a, b) => b.score - a.score);

        if (this.difficulty === 'normal' && scored.length > 2) {
            const pool = scored.slice(0, Math.min(3, scored.length));
            return pool[Math.floor(Math.random() * pool.length)];
        }

        return scored[0];
    }

    scoreMove(move) {
        const nextBoard = this.board.map(row => row.slice());
        nextBoard[move.r][move.c] = 'white';
        move.flips.forEach(({ r, c }) => {
            nextBoard[r][c] = 'white';
        });

        const whiteMoves = this.getValidMoves('white', nextBoard).length;
        const blackMoves = this.getValidMoves('black', nextBoard).length;
        const countScore = move.flips.length * (this.difficulty === 'hard' ? 4 : 10);
        const positionScore = this.weights[move.r][move.c];
        const mobilityScore = (whiteMoves - blackMoves) * 3;
        return countScore + positionScore + mobilityScore + Math.random() * 0.01;
    }

    getCounts() {
        let black = 0;
        let white = 0;
        for (const row of this.board) {
            for (const cell of row) {
                if (cell === 'black') black++;
                if (cell === 'white') white++;
            }
        }
        return { black, white };
    }

    handleGameOver() {
        this.isGameOver = true;
        this.updateUI();
        this.draw();

        const counts = this.getCounts();
        let title;
        let winner;
        if (counts.black === counts.white) {
            title = window.i18n.t('game.draw');
            winner = window.i18n.t('game.draw.msg');
        } else if (counts.black > counts.white) {
            title = this.gameMode === 'ai' ? window.i18n.t('game.win') : window.i18n.t('game.win');
            winner = window.i18n.t('rev.black.win');
        } else {
            title = this.gameMode === 'ai' ? window.i18n.t('game.lose') : window.i18n.t('game.win');
            winner = this.gameMode === 'ai' ? window.i18n.t('rev.ai.win') : window.i18n.t('rev.white.win');
        }

        setTimeout(() => {
            this.winTitle.textContent = title;
            this.winTitle.style.background = 'linear-gradient(to right,#22c55e,#84cc16)';
            this.winTitle.style.webkitBackgroundClip = 'text';
            this.winTitle.style.backgroundClip = 'text';
            this.winTitle.style.webkitTextFillColor = 'transparent';
            this.winDesc.textContent = `${winner} (${counts.black} : ${counts.white})`;
            this.winOverlay.classList.remove('hidden');
        }, 450);
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);
        this.drawBoard();
        this.drawHints();
        this.drawDiscs();
    }

    drawBoard() {
        const ctx = this.ctx;
        const pad = this.boardPad;
        const cs = this.cellSize;
        const boardSize = cs * this.SIZE;

        const bg = ctx.createLinearGradient(0, 0, this.W, this.H);
        bg.addColorStop(0, '#0f172a');
        bg.addColorStop(1, '#020617');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.W, this.H);

        const boardGrad = ctx.createLinearGradient(pad, pad, pad + boardSize, pad + boardSize);
        boardGrad.addColorStop(0, '#1fa463');
        boardGrad.addColorStop(1, '#0d5c3a');
        ctx.fillStyle = boardGrad;
        ctx.fillRect(pad, pad, boardSize, boardSize);

        ctx.strokeStyle = 'rgba(2,6,23,0.75)';
        ctx.lineWidth = 2;
        for (let i = 0; i <= this.SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(pad, pad + i * cs);
            ctx.lineTo(pad + boardSize, pad + i * cs);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pad + i * cs, pad);
            ctx.lineTo(pad + i * cs, pad + boardSize);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 3;
        ctx.strokeRect(pad, pad, boardSize, boardSize);
    }

    drawHints() {
        if (this.isGameOver || this.isAIThinking) return;
        if (this.gameMode === 'ai' && this.currentTurn === 'white') return;

        const ctx = this.ctx;
        const cs = this.cellSize;
        const pad = this.boardPad;
        const moves = this.getValidMoves(this.currentTurn);
        const hoverKey = this.hoverMove ? `${this.hoverMove.r},${this.hoverMove.c}` : '';

        for (const move of moves) {
            const x = pad + move.c * cs + cs / 2;
            const y = pad + move.r * cs + cs / 2;
            const isHover = hoverKey === `${move.r},${move.c}`;
            ctx.save();
            ctx.globalAlpha = isHover ? 0.75 : 0.38;
            ctx.fillStyle = this.currentTurn === 'black' ? '#111827' : '#f8fafc';
            ctx.beginPath();
            ctx.arc(x, y, isHover ? cs * 0.23 : cs * 0.13, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    drawDiscs() {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const pad = this.boardPad;
        const radius = cs * 0.36;

        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                const cell = this.board[r][c];
                if (!cell) continue;

                const x = pad + c * cs + cs / 2;
                const y = pad + r * cs + cs / 2;
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.45)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetY = 3;
                const disc = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.08, x, y, radius);
                if (cell === 'black') {
                    disc.addColorStop(0, '#4b5563');
                    disc.addColorStop(0.45, '#111827');
                    disc.addColorStop(1, '#020617');
                } else {
                    disc.addColorStop(0, '#ffffff');
                    disc.addColorStop(0.55, '#f1f5f9');
                    disc.addColorStop(1, '#cbd5e1');
                }
                ctx.fillStyle = disc;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    updateUI() {
        const counts = this.getCounts();
        this.blackCountEl.textContent = counts.black;
        this.whiteCountEl.textContent = counts.white;
        this.blackPlayerEl.classList.toggle('active', this.currentTurn === 'black');
        this.whitePlayerEl.classList.toggle('active', this.currentTurn === 'white');

        if (this.isGameOver) {
            this.statusEl.textContent = window.i18n.t('chess.gameover.desc');
        } else if (this.isAIThinking) {
            this.statusEl.textContent = window.i18n.t('game.ai.thinking');
        } else if (this.passMessage) {
            this.statusEl.textContent = this.passMessage;
        } else {
            this.statusEl.textContent = this.currentTurn === 'black' ? window.i18n.t('rev.black.turn') : window.i18n.t('rev.white.turn');
        }
    }

    refreshLang() {
        if (this.gameMode === 'ai') {
            this.whiteLabelEl.textContent = window.i18n.t('rev.ai.white');
        } else {
            this.whiteLabelEl.textContent = window.i18n.t('rev.white');
        }
        if (this.passMessage) {
            const skipped = this.currentTurn === 'black' ? 'white' : 'black';
            this.passMessage = skipped === 'black' ? window.i18n.t('rev.black.pass') : window.i18n.t('rev.white.pass');
        }
        this.updateUI();
    }
}

window.reversiGame = new ReversiGame();
