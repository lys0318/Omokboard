class Connect4 {
    constructor() {
        this.ROWS = 6;
        this.COLS = 7;
        this.board = [];
        this.currentTurn = 'red';   // 'red' | 'yellow'
        this.gameMode = 'pvp';       // 'pvp' | 'ai'
        this.difficulty = 'normal';
        this.isGameOver = false;

        this.boardEl  = document.getElementById('c4-board');
        this.hintsEl  = document.getElementById('c4-hints');
        this.statusEl = document.getElementById('c4-status');
        this.winOverlay  = document.getElementById('c4-win-overlay');
        this.winTitle    = document.getElementById('c4-win-title');
        this.winDesc     = document.getElementById('c4-win-desc');

        this.init();
    }

    init() {
        this.buildDOM();
        this.bindEvents();
        this.reset();
    }

    buildDOM() {
        // Column hint arrows
        this.hintsEl.innerHTML = '';
        for (let c = 0; c < this.COLS; c++) {
            const hint = document.createElement('div');
            hint.className = 'c4-col-hint';
            hint.dataset.col = c;
            this.hintsEl.appendChild(hint);
        }

        // Board cells
        this.boardEl.innerHTML = '';
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                const cell = document.createElement('div');
                cell.className = 'c4-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                this.boardEl.appendChild(cell);
            }
        }
    }

    bindEvents() {
        // Click on board or hints
        const drop = (col) => {
            if (this.isGameOver) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'yellow') return;
            this.dropPiece(col);
        };

        this.boardEl.addEventListener('click', e => {
            const cell = e.target.closest('.c4-cell');
            if (cell) drop(parseInt(cell.dataset.col));
        });

        this.hintsEl.addEventListener('click', e => {
            const hint = e.target.closest('.c4-col-hint');
            if (hint) drop(parseInt(hint.dataset.col));
        });

        // Hover hints
        this.hintsEl.addEventListener('mouseover', e => {
            const hint = e.target.closest('.c4-col-hint');
            if (!hint || this.isGameOver) return;
            hint.classList.remove('hint-red', 'hint-yellow');
            hint.classList.add(this.currentTurn === 'red' ? 'hint-red' : 'hint-yellow');
        });

        document.getElementById('c4-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('c4-ai-btn').addEventListener('click', () => this.startGame('ai'));
        document.getElementById('c4-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.reset();
        });

        document.querySelectorAll('.c4-diff-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.c4-diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.difficulty = btn.dataset.diff;
            });
        });
    }

    startGame(mode) {
        this.gameMode = mode;
        const yellowLabel = document.getElementById('c4-yellow-label');
        yellowLabel.textContent = mode === 'ai' ? 'AI (Yellow)' : '노랑 (Yellow)';
        this.reset();
    }

    reset() {
        this.board = Array.from({ length: this.ROWS }, () => Array(this.COLS).fill(null));
        this.currentTurn = 'red';
        this.isGameOver = false;

        document.querySelectorAll('.c4-cell').forEach(cell => {
            cell.className = 'c4-cell';
        });
        this.updateStatus();
        this.updatePlayerHighlight();
    }

    // Returns the lowest empty row in a column, or -1 if full
    getDropRow(col) {
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (!this.board[r][col]) return r;
        }
        return -1;
    }

    dropPiece(col) {
        const row = this.getDropRow(col);
        if (row === -1) return; // column full

        this.board[row][col] = this.currentTurn;
        const cell = this.boardEl.querySelector(`.c4-cell[data-row="${row}"][data-col="${col}"]`);
        cell.classList.add(this.currentTurn, 'drop');

        const winner = this.checkWin(row, col);
        if (winner) {
            this.handleWin(winner);
            return;
        }
        if (this.checkDraw()) {
            this.handleDraw();
            return;
        }

        this.currentTurn = this.currentTurn === 'red' ? 'yellow' : 'red';
        this.updateStatus();
        this.updatePlayerHighlight();

        if (this.gameMode === 'ai' && this.currentTurn === 'yellow') {
            this.scheduleAI();
        }
    }

    scheduleAI() {
        const delay = this.difficulty === 'easy' ? 900 : this.difficulty === 'hard' ? 100 : 400;
        setTimeout(() => {
            if (this.isGameOver) return;
            const col = this.getBestCol();
            if (col !== -1) this.dropPiece(col);
        }, delay);
    }

    // ─── AI ──────────────────────────────────────────────────

    getBestCol() {
        const defenseFactor = this.difficulty === 'easy' ? 0.5 : this.difficulty === 'hard' ? 1.0 : 0.9;
        const scored = [];

        for (let c = 0; c < this.COLS; c++) {
            const r = this.getDropRow(c);
            if (r === -1) continue;

            this.board[r][c] = 'yellow';
            const aiScore = this.scorePosition(r, c, 'yellow');
            this.board[r][c] = null;

            this.board[r][c] = 'red';
            const oppScore = this.scorePosition(r, c, 'red');
            this.board[r][c] = null;

            const score = aiScore >= 100000 ? aiScore : Math.max(aiScore, oppScore * defenseFactor);
            scored.push({ c, score });
        }

        scored.sort((a, b) => b.score - a.score);
        if (!scored.length) return -1;

        if (this.difficulty === 'easy' && scored[0].score < 100000 && scored.length > 1) {
            const pool = scored.slice(0, Math.min(4, scored.length));
            return pool[Math.floor(Math.random() * pool.length)].c;
        }

        // Prefer center columns when scores are equal
        return scored[0].c;
    }

    scorePosition(row, col, player) {
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        let total = 0;
        for (const [dr, dc] of dirs) {
            let count = 1, open = 0;
            for (const sign of [1, -1]) {
                let r = row + dr*sign, c = col + dc*sign;
                while (r>=0 && r<this.ROWS && c>=0 && c<this.COLS && this.board[r][c]===player) {
                    count++; r+=dr*sign; c+=dc*sign;
                }
                if (r>=0 && r<this.ROWS && c>=0 && c<this.COLS && this.board[r][c]===null) open++;
            }
            if (count >= 4) return 100000;
            if (open === 0) continue;
            if (count === 3) total += open === 2 ? 5000 : 500;
            else if (count === 2) total += open === 2 ? 100 : 10;
            else total += 1;
        }
        return total;
    }

    // ─── Win detection ────────────────────────────────────────

    checkWin(row, col) {
        const dirs = [[[0,1],[0,-1]], [[1,0],[-1,0]], [[1,1],[-1,-1]], [[1,-1],[-1,1]]];
        const player = this.board[row][col];
        for (const pair of dirs) {
            let line = [{ r: row, c: col }];
            for (const [dr, dc] of pair) {
                let r = row+dr, c = col+dc;
                while (r>=0 && r<this.ROWS && c>=0 && c<this.COLS && this.board[r][c]===player) {
                    line.push({ r, c }); r+=dr; c+=dc;
                }
            }
            if (line.length >= 4) return line;
        }
        return null;
    }

    checkDraw() {
        return this.board[0].every(cell => cell !== null);
    }

    handleWin(winLine) {
        this.isGameOver = true;
        winLine.forEach(({ r, c }) => {
            this.boardEl.querySelector(`.c4-cell[data-row="${r}"][data-col="${c}"]`).classList.add('winning');
        });

        setTimeout(() => {
            const isRed = this.currentTurn === 'red';
            let name;
            if (this.gameMode === 'ai') {
                name = isRed ? '당신' : 'AI';
            } else {
                name = isRed ? '빨강' : '노랑';
            }
            this.winTitle.textContent = (this.gameMode === 'ai' && !isRed) ? '패배...' : '승리!';
            this.winTitle.style.background = isRed
                ? 'linear-gradient(to right, #ef4444, #dc2626)'
                : 'linear-gradient(to right, #eab308, #ca8a04)';
            this.winTitle.style.webkitBackgroundClip = 'text';
            this.winTitle.style.webkitTextFillColor = 'transparent';
            this.winTitle.style.backgroundClip = 'text';
            this.winDesc.textContent = `${name}이 승리했습니다!`;
            this.winOverlay.classList.remove('hidden');
        }, 600);
    }

    handleDraw() {
        this.isGameOver = true;
        setTimeout(() => {
            this.winTitle.textContent = '무승부';
            this.winTitle.style.background = 'linear-gradient(to right, #94a3b8, #64748b)';
            this.winTitle.style.webkitBackgroundClip = 'text';
            this.winTitle.style.webkitTextFillColor = 'transparent';
            this.winTitle.style.backgroundClip = 'text';
            this.winDesc.textContent = '모든 칸이 채워졌습니다.';
            this.winOverlay.classList.remove('hidden');
        }, 400);
    }

    updateStatus() {
        if (this.gameMode === 'ai' && this.currentTurn === 'yellow') {
            this.statusEl.textContent = 'AI 생각중...';
        } else {
            this.statusEl.textContent = this.currentTurn === 'red' ? '빨강의 차례입니다' : '노랑의 차례입니다';
        }
    }

    updatePlayerHighlight() {
        document.getElementById('c4-player-red').classList.toggle('active', this.currentTurn === 'red');
        document.getElementById('c4-player-yellow').classList.toggle('active', this.currentTurn === 'yellow');
    }
}

window.c4Game = new Connect4();
