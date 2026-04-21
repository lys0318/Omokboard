class Connect4 {
    constructor() {
        this.ROWS = 7;
        this.COLS = 9;
        this.board = [];
        this.currentTurn = 'red';
        this.gameMode = 'pvp';
        this.difficulty = 'normal';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.hoverPos = null;
        this.winLine = null;

        this.canvas   = document.getElementById('c4-canvas');
        this.ctx      = this.canvas.getContext('2d');
        this.statusEl = document.getElementById('c4-status');
        this.winOverlay  = document.getElementById('c4-win-overlay');
        this.winTitle    = document.getElementById('c4-win-title');
        this.winDesc     = document.getElementById('c4-win-desc');
        this.modeOverlay = document.getElementById('c4-mode-overlay');

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
    }

    // ─── Layout ───────────────────────────────────────────────
    get cellSize() {
        return Math.min(
            Math.floor((this.W - 40) / this.COLS),
            Math.floor((this.H - 40) / this.ROWS)
        );
    }
    get boardLeft() { return Math.floor((this.W - this.cellSize * (this.COLS - 1)) / 2); }
    get boardTop()  { return Math.floor((this.H - this.cellSize * (this.ROWS - 1)) / 2); }
    get stoneR()    { return Math.floor(this.cellSize * 0.4); }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 560);
        this.W = maxW;
        this.H = Math.round(maxW * 0.62);
        this.canvas.width  = this.W;
        this.canvas.height = this.H;
        this.draw();
    }

    getCell(px, py) {
        const cs  = this.cellSize;
        const bl  = this.boardLeft, bt = this.boardTop;
        const thr = cs * 0.48;
        let best = null, bestDist = Infinity;
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                const dist = Math.hypot(px - (bl + c*cs), py - (bt + r*cs));
                if (dist < thr && dist < bestDist) { bestDist = dist; best = { r, c }; }
            }
        }
        return best;
    }

    // ─── Events ───────────────────────────────────────────────
    bindEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const sx = this.canvas.width / rect.width;
            const sy = this.canvas.height / rect.height;
            const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
            return { x: (src.clientX - rect.left)*sx, y: (src.clientY - rect.top)*sy };
        };

        this.canvas.addEventListener('click', e => {
            if (this.isGameOver || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'yellow') return;
            const { x, y } = getPos(e);
            const cell = this.getCell(x, y);
            if (cell) this.placePiece(cell.r, cell.c);
        });
        this.canvas.addEventListener('mousemove', e => {
            if (this.isGameOver || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'yellow') return;
            const { x, y } = getPos(e);
            this.hoverPos = this.getCell(x, y);
            this.draw();
        });
        this.canvas.addEventListener('mouseleave', () => { this.hoverPos = null; this.draw(); });
        this.canvas.addEventListener('touchstart', e => {
            const { x, y } = getPos(e);
            this.hoverPos = this.getCell(x, y);
            this.draw();
            e.preventDefault();
        }, { passive: false });
        this.canvas.addEventListener('touchend', e => {
            if (this.isGameOver || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'yellow') return;
            const { x, y } = getPos(e);
            const cell = this.getCell(x, y);
            if (cell) this.placePiece(cell.r, cell.c);
            this.hoverPos = null;
            e.preventDefault();
        }, { passive: false });

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
        document.getElementById('c4-home-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
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
        this.gameMode   = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        document.getElementById('c4-yellow-label').textContent = mode === 'ai' ? 'AI (Yellow)' : '노랑 (Yellow)';
        this.reset();
    }

    reset() {
        this.board        = Array.from({ length: this.ROWS }, () => Array(this.COLS).fill(null));
        this.currentTurn  = 'red';
        this.isGameOver   = false;
        this.isAIThinking = false;
        this.hoverPos     = null;
        this.winLine      = null;
        this.updateStatus();
        this.updateHighlight();
        this.draw();
    }

    placePiece(row, col) {
        if (this.board[row][col]) return;
        this.board[row][col] = this.currentTurn;

        const winLine = this.checkWin(row, col);
        if (winLine) { this.winLine = winLine; this.draw(); this.handleWin(); return; }
        if (this.checkDraw()) { this.draw(); this.handleDraw(); return; }

        this.currentTurn = this.currentTurn === 'red' ? 'yellow' : 'red';
        this.updateStatus();
        this.updateHighlight();
        this.draw();

        if (this.gameMode === 'ai' && this.currentTurn === 'yellow') this.scheduleAI();
    }

    // ─── AI ──────────────────────────────────────────────────
    scheduleAI() {
        this.isAIThinking = true;
        this.updateStatus();
        const delay = this.difficulty === 'easy' ? 700 : this.difficulty === 'hard' ? 100 : 350;
        setTimeout(() => {
            if (this.isGameOver) { this.isAIThinking = false; return; }
            const move = this.getBestMove();
            this.isAIThinking = false;
            if (move) this.placePiece(move.r, move.c);
        }, delay);
    }

    getBestMove() {
        const defenseFactor = this.difficulty === 'easy' ? 0.5 : this.difficulty === 'hard' ? 1.0 : 0.9;
        const scored = [];
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                if (this.board[r][c]) continue;
                this.board[r][c] = 'yellow';
                const aiScore = this.scorePos(r, c, 'yellow');
                this.board[r][c] = null;
                this.board[r][c] = 'red';
                const oppScore = this.scorePos(r, c, 'red');
                this.board[r][c] = null;
                const score = aiScore >= 100000 ? aiScore : Math.max(aiScore, oppScore * defenseFactor);
                scored.push({ r, c, score });
            }
        }
        scored.sort((a, b) => b.score - a.score);
        if (!scored.length) return null;
        if (this.difficulty === 'easy' && scored[0].score < 100000 && scored.length > 1) {
            const pool = scored.slice(0, Math.min(5, scored.length));
            return pool[Math.floor(Math.random() * pool.length)];
        }
        return scored[0];
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
            let line = [{ r:row, c:col }];
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

    checkDraw() { return this.board.every(row => row.every(c => c !== null)); }

    handleWin() {
        this.isGameOver = true;
        setTimeout(() => {
            const isRed = this.currentTurn === 'red';
            const name  = this.gameMode === 'ai' ? (isRed ? '당신' : 'AI') : (isRed ? '빨강' : '노랑');
            this.winTitle.textContent = (this.gameMode === 'ai' && !isRed) ? '패배...' : '승리!';
            this.winTitle.style.background = isRed
                ? 'linear-gradient(to right,#ef4444,#dc2626)'
                : 'linear-gradient(to right,#eab308,#ca8a04)';
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
            this.winTitle.style.background = 'linear-gradient(to right,#94a3b8,#64748b)';
            this.winTitle.style.webkitBackgroundClip = 'text';
            this.winTitle.style.backgroundClip = 'text';
            this.winTitle.style.webkitTextFillColor = 'transparent';
            this.winDesc.textContent = '보드가 가득 찼습니다.';
            this.winOverlay.classList.remove('hidden');
        }, 400);
    }

    // ─── Drawing ─────────────────────────────────────────────
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, this.W, this.H);
        this.drawBoard();
        this.drawStones();

        if (this.hoverPos && !this.isGameOver) {
            const { r, c } = this.hoverPos;
            if (!this.board[r][c]) {
                const x = this.boardLeft + c * this.cellSize;
                const y = this.boardTop  + r * this.cellSize;
                ctx.save();
                ctx.globalAlpha = 0.45;
                ctx.fillStyle = this.currentTurn === 'red' ? '#ef4444' : '#eab308';
                ctx.beginPath(); ctx.arc(x, y, this.stoneR, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            }
        }
    }

    drawBoard() {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const bl = this.boardLeft, bt = this.boardTop;
        const pad = cs * 0.65;
        const bL = bl - pad, bT = bt - pad;
        const bW = cs*(this.COLS-1) + pad*2, bH = cs*(this.ROWS-1) + pad*2;

        // Outer wooden frame
        const og = ctx.createLinearGradient(0, 0, this.W, this.H);
        og.addColorStop(0, '#a86f2e'); og.addColorStop(1, '#7a4f20');
        ctx.fillStyle = og;
        ctx.beginPath(); ctx.roundRect(0, 0, this.W, this.H, 10); ctx.fill();

        // Inner board surface
        const bg = ctx.createLinearGradient(bL, bT, bL+bW, bT+bH);
        bg.addColorStop(0, '#deae6c'); bg.addColorStop(1, '#c8903a');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.roundRect(bL, bT, bW, bH, 6); ctx.fill();

        // Wood grain
        ctx.save();
        ctx.beginPath(); ctx.roundRect(bL, bT, bW, bH, 6); ctx.clip();
        ctx.strokeStyle = 'rgba(90,55,20,0.10)'; ctx.lineWidth = 1;
        for (let yy = bT+8; yy < bT+bH; yy += 13) {
            ctx.beginPath(); ctx.moveTo(bL, yy); ctx.lineTo(bL+bW, yy+3); ctx.stroke();
        }
        ctx.restore();

        // Grid lines
        ctx.strokeStyle = 'rgba(80,45,10,0.55)'; ctx.lineWidth = 1;
        for (let r = 0; r < this.ROWS; r++) {
            ctx.beginPath(); ctx.moveTo(bl, bt+r*cs); ctx.lineTo(bl+(this.COLS-1)*cs, bt+r*cs); ctx.stroke();
        }
        for (let c = 0; c < this.COLS; c++) {
            ctx.beginPath(); ctx.moveTo(bl+c*cs, bt); ctx.lineTo(bl+c*cs, bt+(this.ROWS-1)*cs); ctx.stroke();
        }

        // Star points
        const midR = Math.floor((this.ROWS-1)/2);
        const midC = Math.floor((this.COLS-1)/2);
        const stars = [
            {r:1,c:2},{r:1,c:midC},{r:1,c:this.COLS-3},
            {r:midR,c:2},{r:midR,c:midC},{r:midR,c:this.COLS-3},
            {r:this.ROWS-2,c:2},{r:this.ROWS-2,c:midC},{r:this.ROWS-2,c:this.COLS-3}
        ];
        ctx.fillStyle = 'rgba(80,45,10,0.6)';
        for (const { r, c } of stars) {
            ctx.beginPath(); ctx.arc(bl+c*cs, bt+r*cs, 3.5, 0, Math.PI*2); ctx.fill();
        }

        // Board border
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(bL, bT, bW, bH, 6); ctx.stroke();
    }

    drawStones() {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const bl = this.boardLeft, bt = this.boardTop;
        const r  = this.stoneR;

        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const cell = this.board[row][col];
                if (!cell) continue;
                const x = bl + col*cs, y = bt + row*cs;
                const isWin = this.winLine && this.winLine.some(p => p.r===row && p.c===col);

                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
                const g = ctx.createRadialGradient(x-r*0.3, y-r*0.3, r*0.08, x, y, r);
                if (cell === 'red') {
                    g.addColorStop(0,'#ffaaaa'); g.addColorStop(0.45,'#ef4444'); g.addColorStop(1,'#7f1d1d');
                } else {
                    g.addColorStop(0,'#fff5a0'); g.addColorStop(0.45,'#eab308'); g.addColorStop(1,'#78350f');
                }
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
                ctx.restore();

                ctx.save(); ctx.globalAlpha = 0.4;
                const sh = ctx.createRadialGradient(x-r*0.35,y-r*0.35,r*0.04,x-r*0.2,y-r*0.2,r*0.6);
                sh.addColorStop(0,'rgba(255,255,255,0.9)'); sh.addColorStop(1,'rgba(255,255,255,0)');
                ctx.fillStyle = sh;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
                ctx.restore();

                if (isWin) {
                    ctx.save();
                    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.5;
                    ctx.shadowColor = '#facc15'; ctx.shadowBlur = 10;
                    ctx.beginPath(); ctx.arc(x, y, r+3, 0, Math.PI*2); ctx.stroke();
                    ctx.restore();
                }
            }
        }
    }

    updateStatus() {
        if (this.isAIThinking) {
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
