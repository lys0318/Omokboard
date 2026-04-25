class DotsGame {
    constructor() {
        this.DOTS = 6;
        this.BOXES = this.DOTS - 1;
        this.currentTurn = 'red';
        this.gameMode = 'pvp';
        this.difficulty = 'normal';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.hoverLine = null;

        this.canvas = document.getElementById('dots-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.statusEl = document.getElementById('dots-status');
        this.redScoreEl = document.getElementById('dots-red-score');
        this.blueScoreEl = document.getElementById('dots-blue-score');
        this.redPlayerEl = document.getElementById('dots-player-red');
        this.bluePlayerEl = document.getElementById('dots-player-blue');
        this.blueLabelEl = document.getElementById('dots-blue-label');
        this.modeOverlay = document.getElementById('dots-mode-overlay');
        this.winOverlay = document.getElementById('dots-win-overlay');
        this.winTitle = document.getElementById('dots-win-title');
        this.winDesc = document.getElementById('dots-win-desc');

        this.reset();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
    }

    emptyLines() {
        return {
            h: Array.from({ length: this.DOTS }, () => Array(this.DOTS - 1).fill(null)),
            v: Array.from({ length: this.DOTS - 1 }, () => Array(this.DOTS).fill(null))
        };
    }

    emptyBoxes() {
        return Array.from({ length: this.BOXES }, () => Array(this.BOXES).fill(null));
    }

    reset() {
        const lines = this.emptyLines();
        this.hLines = lines.h;
        this.vLines = lines.v;
        this.boxes = this.emptyBoxes();
        this.scores = { red: 0, blue: 0 };
        this.currentTurn = 'red';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.hoverLine = null;
        this.updateUI();
        if (this.ctx && this.W) this.draw();
    }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 540);
        this.W = Math.max(300, maxW);
        this.H = this.W;
        this.canvas.width = this.W;
        this.canvas.height = this.H;
        this.draw();
    }

    get boardPad() {
        return Math.max(34, Math.floor(this.W * 0.1));
    }

    get cellSize() {
        return (this.W - this.boardPad * 2) / (this.DOTS - 1);
    }

    bindEvents() {
        const handleMove = (e) => {
            if (!this.canHumanMove()) return;
            this.hoverLine = this.getLineAt(this.getPos(e));
            this.draw();
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!this.canHumanMove()) return;
            const line = this.getLineAt(this.getPos(e));
            if (line) this.placeLine(line);
        });

        this.canvas.addEventListener('pointermove', handleMove);
        this.canvas.addEventListener('pointerleave', () => {
            this.hoverLine = null;
            this.draw();
        });

        document.getElementById('dots-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('dots-ai-select-btn').addEventListener('click', () => {
            document.getElementById('dots-step-mode').classList.add('hidden');
            document.getElementById('dots-step-diff').classList.remove('hidden');
        });
        document.getElementById('dots-easy-btn').addEventListener('click', () => this.startGame('ai', 'easy'));
        document.getElementById('dots-normal-btn').addEventListener('click', () => this.startGame('ai', 'normal'));
        document.getElementById('dots-hard-btn').addEventListener('click', () => this.startGame('ai', 'hard'));
        document.getElementById('dots-diff-back').addEventListener('click', () => {
            document.getElementById('dots-step-diff').classList.add('hidden');
            document.getElementById('dots-step-mode').classList.remove('hidden');
        });
        document.getElementById('dots-restart-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('dots-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
    }

    canHumanMove() {
        if (this.isGameOver || this.isAIThinking) return false;
        return !(this.gameMode === 'ai' && this.currentTurn === 'blue');
    }

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const src = e.touches && e.touches.length
            ? e.touches[0]
            : (e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e);
        return {
            x: (src.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (src.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('dots-step-mode').classList.remove('hidden');
        document.getElementById('dots-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'normal') {
        this.gameMode = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        this.blueLabelEl.textContent = mode === 'ai' ? window.i18n.t('dots.ai.blue') : window.i18n.t('dots.blue');
        this.reset();
    }

    point(row, col) {
        return {
            x: this.boardPad + col * this.cellSize,
            y: this.boardPad + row * this.cellSize
        };
    }

    sameLine(a, b) {
        return !!a && !!b && a.type === b.type && a.r === b.r && a.c === b.c;
    }

    isLineTaken(line, hLines = this.hLines, vLines = this.vLines) {
        return line.type === 'h' ? !!hLines[line.r][line.c] : !!vLines[line.r][line.c];
    }

    setLine(line, player, hLines = this.hLines, vLines = this.vLines) {
        if (line.type === 'h') hLines[line.r][line.c] = player;
        else vLines[line.r][line.c] = player;
    }

    getLineOwner(line) {
        return line.type === 'h' ? this.hLines[line.r][line.c] : this.vLines[line.r][line.c];
    }

    getLineAt(pos) {
        const candidates = [];
        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS - 1; c++) {
                candidates.push({ type: 'h', r, c });
            }
        }
        for (let r = 0; r < this.DOTS - 1; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                candidates.push({ type: 'v', r, c });
            }
        }

        let best = null;
        let bestDist = Infinity;
        for (const line of candidates) {
            if (this.isLineTaken(line)) continue;
            const dist = this.distanceToLine(pos, line);
            if (dist < bestDist) {
                bestDist = dist;
                best = line;
            }
        }

        return bestDist <= this.cellSize * 0.24 ? best : null;
    }

    distanceToLine(pos, line) {
        const a = this.point(line.r, line.c);
        const b = line.type === 'h' ? this.point(line.r, line.c + 1) : this.point(line.r + 1, line.c);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / lenSq));
        const x = a.x + t * dx;
        const y = a.y + t * dy;
        return Math.hypot(pos.x - x, pos.y - y);
    }

    adjacentBoxes(line) {
        const boxes = [];
        if (line.type === 'h') {
            if (line.r > 0) boxes.push({ r: line.r - 1, c: line.c });
            if (line.r < this.BOXES) boxes.push({ r: line.r, c: line.c });
        } else {
            if (line.c > 0) boxes.push({ r: line.r, c: line.c - 1 });
            if (line.c < this.BOXES) boxes.push({ r: line.r, c: line.c });
        }
        return boxes;
    }

    countBoxSides(row, col, hLines = this.hLines, vLines = this.vLines) {
        let sides = 0;
        if (hLines[row][col]) sides++;
        if (hLines[row + 1][col]) sides++;
        if (vLines[row][col]) sides++;
        if (vLines[row][col + 1]) sides++;
        return sides;
    }

    placeLine(line) {
        if (!line || this.isLineTaken(line) || this.isGameOver) return false;

        this.setLine(line, this.currentTurn);
        const completed = [];
        for (const box of this.adjacentBoxes(line)) {
            if (!this.boxes[box.r][box.c] && this.countBoxSides(box.r, box.c) === 4) {
                this.boxes[box.r][box.c] = this.currentTurn;
                completed.push(box);
            }
        }

        if (completed.length) {
            this.scores[this.currentTurn] += completed.length;
        } else {
            this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
        }

        this.hoverLine = null;
        if (this.isBoardFull()) {
            this.handleGameOver();
            return true;
        }

        this.updateUI();
        this.draw();
        if (this.gameMode === 'ai' && this.currentTurn === 'blue') this.scheduleAI();
        return true;
    }

    isBoardFull() {
        return this.scores.red + this.scores.blue === this.BOXES * this.BOXES;
    }

    getAvailableMoves(hLines = this.hLines, vLines = this.vLines) {
        const moves = [];
        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS - 1; c++) {
                if (!hLines[r][c]) moves.push({ type: 'h', r, c });
            }
        }
        for (let r = 0; r < this.DOTS - 1; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                if (!vLines[r][c]) moves.push({ type: 'v', r, c });
            }
        }
        return moves;
    }

    scheduleAI() {
        this.isAIThinking = true;
        this.updateUI();
        const delay = this.difficulty === 'easy' ? 650 : this.difficulty === 'hard' ? 260 : 430;
        setTimeout(() => {
            if (this.isGameOver) {
                this.isAIThinking = false;
                return;
            }
            const move = this.getBestMove();
            this.isAIThinking = false;
            if (move) this.placeLine(move);
        }, delay);
    }

    getBestMove() {
        const moves = this.getAvailableMoves();
        if (!moves.length) return null;
        if (this.difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];

        const scored = moves.map(move => ({ ...move, score: this.scoreMove(move) }))
            .sort((a, b) => b.score - a.score);

        if (this.difficulty === 'normal') {
            const pool = scored.slice(0, Math.min(4, scored.length));
            return pool[Math.floor(Math.random() * pool.length)];
        }
        return scored[0];
    }

    scoreMove(move) {
        const hLines = this.hLines.map(row => row.slice());
        const vLines = this.vLines.map(row => row.slice());
        this.setLine(move, 'blue', hLines, vLines);

        let completed = 0;
        let createsThirdSide = 0;
        let leavesAlmostBox = 0;
        for (const box of this.adjacentBoxes(move)) {
            if (this.boxes[box.r][box.c]) continue;
            const before = this.countBoxSides(box.r, box.c);
            const after = this.countBoxSides(box.r, box.c, hLines, vLines);
            if (after === 4) completed++;
            if (after === 3 && before < 3) createsThirdSide++;
            if (after === 2) leavesAlmostBox++;
        }

        const allMovesAfter = this.getAvailableMoves(hLines, vLines);
        let opponentBoxes = 0;
        for (const next of allMovesAfter) {
            for (const box of this.adjacentBoxes(next)) {
                if (!this.boxes[box.r][box.c] && this.countBoxSides(box.r, box.c, hLines, vLines) === 3) {
                    opponentBoxes++;
                    break;
                }
            }
        }

        const hardMultiplier = this.difficulty === 'hard' ? 1.4 : 1;
        return completed * 140
            - createsThirdSide * 80 * hardMultiplier
            - opponentBoxes * 2 * hardMultiplier
            + leavesAlmostBox * 3
            + Math.random() * 0.01;
    }

    getCounts() {
        return { red: this.scores.red, blue: this.scores.blue };
    }

    handleGameOver() {
        this.isGameOver = true;
        this.updateUI();
        this.draw();

        const counts = this.getCounts();
        let title = window.i18n.t('game.win');
        let desc;
        if (counts.red === counts.blue) {
            title = window.i18n.t('game.draw');
            desc = window.i18n.t('game.draw.msg');
        } else if (counts.red > counts.blue) {
            title = this.gameMode === 'ai' ? window.i18n.t('game.win') : window.i18n.t('game.win');
            desc = this.gameMode === 'ai' ? window.i18n.t('dots.you.win') : window.i18n.t('dots.red.win');
        } else {
            title = this.gameMode === 'ai' ? window.i18n.t('game.lose') : window.i18n.t('game.win');
            desc = this.gameMode === 'ai' ? window.i18n.t('dots.ai.win') : window.i18n.t('dots.blue.win');
        }

        setTimeout(() => {
            this.winTitle.textContent = title;
            this.winDesc.textContent = `${desc} (${counts.red} : ${counts.blue})`;
            this.winOverlay.classList.remove('hidden');
        }, 350);
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);
        this.drawBoard();
        this.drawBoxes();
        this.drawLines();
        this.drawDots();
    }

    drawBoard() {
        const ctx = this.ctx;
        const grad = ctx.createLinearGradient(0, 0, this.W, this.H);
        grad.addColorStop(0, '#172033');
        grad.addColorStop(1, '#07111f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.W, this.H);

        const pad = this.boardPad;
        const size = this.cellSize * (this.DOTS - 1);
        const boardGrad = ctx.createLinearGradient(pad, pad, pad + size, pad + size);
        boardGrad.addColorStop(0, '#f0bd75');
        boardGrad.addColorStop(1, '#b97938');
        ctx.fillStyle = boardGrad;
        ctx.fillRect(pad - 22, pad - 22, size + 44, size + 44);
        ctx.strokeStyle = 'rgba(58,36,18,0.55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(pad - 22, pad - 22, size + 44, size + 44);
    }

    drawBoxes() {
        const ctx = this.ctx;
        const cs = this.cellSize;
        for (let r = 0; r < this.BOXES; r++) {
            for (let c = 0; c < this.BOXES; c++) {
                const owner = this.boxes[r][c];
                if (!owner) continue;
                const p = this.point(r, c);
                ctx.save();
                ctx.globalAlpha = 0.28;
                ctx.fillStyle = owner === 'red' ? '#ef4444' : '#3b82f6';
                ctx.fillRect(p.x + 5, p.y + 5, cs - 10, cs - 10);
                ctx.restore();

                ctx.fillStyle = owner === 'red' ? 'rgba(127,29,29,0.55)' : 'rgba(30,64,175,0.55)';
                ctx.font = `800 ${Math.floor(cs * 0.3)}px Outfit, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(owner === 'red' ? 'R' : 'B', p.x + cs / 2, p.y + cs / 2);
            }
        }
    }

    drawLines() {
        const ctx = this.ctx;
        ctx.lineCap = 'round';

        const drawLine = (line, owner, alpha = 1) => {
            const a = this.point(line.r, line.c);
            const b = line.type === 'h' ? this.point(line.r, line.c + 1) : this.point(line.r + 1, line.c);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = owner === 'red' ? '#dc2626' : owner === 'blue' ? '#2563eb' : 'rgba(92,55,24,0.38)';
            ctx.lineWidth = owner ? Math.max(8, this.cellSize * 0.14) : Math.max(3, this.cellSize * 0.05);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.restore();
        };

        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS - 1; c++) {
                drawLine({ type: 'h', r, c }, this.hLines[r][c]);
            }
        }
        for (let r = 0; r < this.DOTS - 1; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                drawLine({ type: 'v', r, c }, this.vLines[r][c]);
            }
        }
        if (this.hoverLine && !this.isLineTaken(this.hoverLine)) {
            drawLine(this.hoverLine, this.currentTurn, 0.48);
        }
    }

    drawDots() {
        const ctx = this.ctx;
        const radius = Math.max(5, this.cellSize * 0.09);
        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                const p = this.point(r, c);
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.35)';
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#2f2117';
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.arc(p.x - radius * 0.32, p.y - radius * 0.32, radius * 0.28, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    updateUI() {
        if (!this.redScoreEl) return;
        this.redScoreEl.textContent = this.scores.red;
        this.blueScoreEl.textContent = this.scores.blue;
        this.redPlayerEl.classList.toggle('active', this.currentTurn === 'red');
        this.bluePlayerEl.classList.toggle('active', this.currentTurn === 'blue');

        if (this.isGameOver) {
            this.statusEl.textContent = window.i18n.t('chess.gameover.desc');
        } else if (this.isAIThinking) {
            this.statusEl.textContent = window.i18n.t('game.ai.thinking');
        } else {
            this.statusEl.textContent = this.currentTurn === 'red'
                ? window.i18n.t('dots.red.turn')
                : window.i18n.t('dots.blue.turn');
        }
    }

    refreshLang() {
        this.blueLabelEl.textContent = this.gameMode === 'ai' ? window.i18n.t('dots.ai.blue') : window.i18n.t('dots.blue');
        this.updateUI();
    }
}

window.dotsGame = new DotsGame();
