class Connect4 {
    constructor() {
        this.ROWS = 6;
        this.COLS = 7;
        this.board = [];
        this.currentTurn = 'red';
        this.gameMode = 'pvp';
        this.difficulty = 'normal';
        this.isGameOver = false;

        this.gridEl    = document.getElementById('c4-board-grid');
        this.arrowsEl  = document.getElementById('c4-col-arrows');
        this.statusEl  = document.getElementById('c4-status');
        this.winOverlay  = document.getElementById('c4-win-overlay');
        this.winTitle    = document.getElementById('c4-win-title');
        this.winDesc     = document.getElementById('c4-win-desc');
        this.modeOverlay = document.getElementById('c4-mode-overlay');

        this.buildDOM();
        this.bindEvents();
        // show mode screen on load
    }

    buildDOM() {
        // Column arrow buttons
        this.arrowsEl.innerHTML = '';
        for (let c = 0; c < this.COLS; c++) {
            const btn = document.createElement('button');
            btn.className = 'c4-arrow';
            btn.dataset.col = c;
            btn.textContent = '▼';
            this.arrowsEl.appendChild(btn);
        }

        // 6×7 holes
        this.gridEl.innerHTML = '';
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                const hole = document.createElement('div');
                hole.className = 'c4-hole';
                hole.dataset.row = r;
                hole.dataset.col = c;
                this.gridEl.appendChild(hole);
            }
        }
    }

    bindEvents() {
        // Arrow buttons
        this.arrowsEl.addEventListener('click', e => {
            const btn = e.target.closest('.c4-arrow');
            if (btn) this.tryDrop(parseInt(btn.dataset.col));
        });

        // Clicking any hole → drop in that column
        this.gridEl.addEventListener('click', e => {
            const hole = e.target.closest('.c4-hole');
            if (hole) this.tryDrop(parseInt(hole.dataset.col));
        });

        // Arrow hover colour by turn
        this.arrowsEl.addEventListener('mouseover', e => {
            const btn = e.target.closest('.c4-arrow');
            if (!btn || this.isGameOver) return;
            btn.classList.remove('turn-red', 'turn-yellow');
            btn.classList.add(this.currentTurn === 'red' ? 'turn-red' : 'turn-yellow');
        });

        // Mode overlay buttons
        document.getElementById('c4-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('c4-ai-select-btn').addEventListener('click', () => {
            document.getElementById('c4-step-mode').classList.add('hidden');
            document.getElementById('c4-step-diff').classList.remove('hidden');
        });
        document.getElementById('c4-easy-btn').addEventListener('click',   () => this.startGame('ai', 'easy'));
        document.getElementById('c4-normal-btn').addEventListener('click', () => this.startGame('ai', 'normal'));
        document.getElementById('c4-hard-btn').addEventListener('click',   () => this.startGame('ai', 'hard'));
        document.getElementById('c4-diff-back').addEventListener('click', () => {
            document.getElementById('c4-step-mode').classList.remove('hidden');
            document.getElementById('c4-step-diff').classList.add('hidden');
        });

        document.getElementById('c4-restart-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('c4-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('c4-step-mode').classList.remove('hidden');
        document.getElementById('c4-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'normal') {
        this.gameMode = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        document.getElementById('c4-yellow-label').textContent = mode === 'ai' ? 'AI (Yellow)' : '노랑 (Yellow)';
        this.reset();
    }

    reset() {
        this.board = Array.from({ length: this.ROWS }, () => Array(this.COLS).fill(null));
        this.currentTurn = 'red';
        this.isGameOver = false;
        document.querySelectorAll('.c4-hole').forEach(h => { h.className = 'c4-hole'; });
        this.updateArrows();
        this.updateStatus();
        this.updateHighlight();
    }

    getDropRow(col) {
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (!this.board[r][col]) return r;
        }
        return -1;
    }

    tryDrop(col) {
        if (this.isGameOver) return;
        if (this.gameMode === 'ai' && this.currentTurn === 'yellow') return;
        this.dropPiece(col);
    }

    dropPiece(col) {
        const row = this.getDropRow(col);
        if (row === -1) return;

        this.board[row][col] = this.currentTurn;
        const hole = this.gridEl.querySelector(`.c4-hole[data-row="${row}"][data-col="${col}"]`);
        hole.classList.add(this.currentTurn, 'drop');

        const winner = this.checkWin(row, col);
        if (winner) { this.handleWin(winner); return; }
        if (this.checkDraw()) { this.handleDraw(); return; }

        this.currentTurn = this.currentTurn === 'red' ? 'yellow' : 'red';
        this.updateArrows();
        this.updateStatus();
        this.updateHighlight();

        if (this.gameMode === 'ai' && this.currentTurn === 'yellow') this.scheduleAI();
    }

    updateArrows() {
        document.querySelectorAll('.c4-arrow').forEach(btn => {
            btn.classList.remove('turn-red', 'turn-yellow');
        });
    }

    // ─── AI ──────────────────────────────────────────────────

    scheduleAI() {
        const delay = this.difficulty === 'easy' ? 900 : this.difficulty === 'hard' ? 120 : 400;
        setTimeout(() => {
            if (this.isGameOver) return;
            const col = this.getBestCol();
            if (col !== -1) this.dropPiece(col);
        }, delay);
    }

    getBestCol() {
        const defenseFactor = this.difficulty === 'easy' ? 0.5 : this.difficulty === 'hard' ? 1.0 : 0.9;
        const scored = [];

        for (let c = 0; c < this.COLS; c++) {
            const r = this.getDropRow(c);
            if (r === -1) continue;

            this.board[r][c] = 'yellow';
            const aiScore = this.scorePos(r, c, 'yellow');
            this.board[r][c] = null;

            this.board[r][c] = 'red';
            const oppScore = this.scorePos(r, c, 'red');
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
        return scored[0].c;
    }

    scorePos(row, col, player) {
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        let total = 0;
        for (const [dr, dc] of dirs) {
            let count = 1, open = 0;
            for (const s of [1, -1]) {
                let r = row + dr*s, c = col + dc*s;
                while (r>=0 && r<this.ROWS && c>=0 && c<this.COLS && this.board[r][c]===player) {
                    count++; r+=dr*s; c+=dc*s;
                }
                if (r>=0 && r<this.ROWS && c>=0 && c<this.COLS && !this.board[r][c]) open++;
            }
            if (count >= 4) return 100000;
            if (!open) continue;
            if (count === 3) total += open===2 ? 5000 : 500;
            else if (count === 2) total += open===2 ? 100 : 10;
            else total += 1;
        }
        return total;
    }

    // ─── Win detection ────────────────────────────────────────

    checkWin(row, col) {
        const dirs = [[[0,1],[0,-1]],[[1,0],[-1,0]],[[1,1],[-1,-1]],[[1,-1],[-1,1]]];
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

    checkDraw() { return this.board[0].every(c => c !== null); }

    handleWin(winLine) {
        this.isGameOver = true;
        winLine.forEach(({ r, c }) => {
            this.gridEl.querySelector(`.c4-hole[data-row="${r}"][data-col="${c}"]`).classList.add('winning');
        });
        setTimeout(() => {
            const isRed = this.currentTurn === 'red';
            let name = this.gameMode === 'ai' ? (isRed ? '당신' : 'AI') : (isRed ? '빨강' : '노랑');
            this.winTitle.textContent = (this.gameMode === 'ai' && !isRed) ? '패배...' : '승리!';
            this.winTitle.style.background = isRed
                ? 'linear-gradient(to right, #ef4444, #dc2626)'
                : 'linear-gradient(to right, #eab308, #ca8a04)';
            this.winTitle.style.webkitBackgroundClip = 'text';
            this.winTitle.style.backgroundClip = 'text';
            this.winTitle.style.webkitTextFillColor = 'transparent';
            this.winDesc.textContent = `${name}이 4개를 연결했습니다!`;
            this.winOverlay.classList.remove('hidden');
        }, 600);
    }

    handleDraw() {
        this.isGameOver = true;
        setTimeout(() => {
            this.winTitle.textContent = '무승부';
            this.winTitle.style.background = 'linear-gradient(to right, #94a3b8, #64748b)';
            this.winTitle.style.webkitBackgroundClip = 'text';
            this.winTitle.style.backgroundClip = 'text';
            this.winTitle.style.webkitTextFillColor = 'transparent';
            this.winDesc.textContent = '보드가 가득 찼습니다.';
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

    updateHighlight() {
        document.getElementById('c4-player-red').classList.toggle('active',    this.currentTurn === 'red');
        document.getElementById('c4-player-yellow').classList.toggle('active', this.currentTurn === 'yellow');
    }
}

window.c4Game = new Connect4();
