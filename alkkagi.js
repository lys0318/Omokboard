const FRICTION    = 0.984;
const RESTITUTION = 0.90;
const MIN_SPEED   = 0.12;
const MAX_LAUNCH  = 20;
const BM          = 28; // board margin (wooden frame width)

class AlkkagiGame {
    constructor() {
        this.canvas = document.getElementById('alkkagi-canvas');
        this.ctx    = this.canvas.getContext('2d');

        this.marbles = [];
        this.currentTurn  = 'red';
        this.isGameOver   = false;
        this.isSimulating = false;
        this.isAIThinking = false;
        this.gameMode     = 'pvp';
        this.difficulty   = 'normal';
        this.animId = null;
        this.dragging = null;

        this.statusEl    = document.getElementById('ak-status');
        this.winOverlay  = document.getElementById('ak-win-overlay');
        this.winTitle    = document.getElementById('ak-win-title');
        this.winDesc     = document.getElementById('ak-win-desc');
        this.modeOverlay = document.getElementById('ak-mode-overlay');

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
    }

    get R() {
        return Math.max(16, Math.min(Math.floor(Math.min(this.W, this.H) / 11), 26));
    }

    get bLeft()   { return BM; }
    get bRight()  { return this.W - BM; }
    get bTop()    { return BM; }
    get bBottom() { return this.H - BM; }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 520);
        this.W = maxW;
        this.H = maxW;   // square canvas — same as 오목 board
        this.canvas.width  = this.W;
        this.canvas.height = this.H;
        if (this.marbles.length) this.reset();
        else this.draw();
    }

    reset() {
        cancelAnimationFrame(this.animId);
        this.isGameOver   = false;
        this.isSimulating = false;
        this.isAIThinking = false;
        this.dragging     = null;
        this.currentTurn  = 'red';

        const R  = this.R;
        const bW = this.bRight  - this.bLeft;
        const bH = this.bBottom - this.bTop;
        const spacing = bH / 6;

        this.marbles = [];
        for (let i = 0; i < 5; i++) {
            this.marbles.push({ color:'red',  x: this.bLeft  + bW*0.15, y: this.bTop + spacing*(i+0.5) + spacing*0.1, vx:0, vy:0, r:R, alive:true });
            this.marbles.push({ color:'blue', x: this.bRight - bW*0.15, y: this.bTop + spacing*(i+0.5) + spacing*0.1, vx:0, vy:0, r:R, alive:true });
        }

        this.updateCounters();
        this.updateStatus();
        this.updateHighlight();
        this.draw();
    }

    bindEvents() {
        const canvas = this.canvas;

        const getPos = e => {
            const rect = canvas.getBoundingClientRect();
            const sx   = canvas.width  / rect.width;
            const sy   = canvas.height / rect.height;
            const src  = e.touches ? e.touches[0] : e;
            return { x: (src.clientX - rect.left)*sx, y: (src.clientY - rect.top)*sy };
        };

        const onDown = e => {
            if (this.isGameOver || this.isSimulating || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.currentTurn === 'blue') return;
            const { x, y } = getPos(e);
            const m = this.marbles.find(m =>
                m.alive && m.color === this.currentTurn &&
                Math.hypot(m.x - x, m.y - y) <= m.r * 1.4
            );
            if (m) { this.dragging = { marble:m, sx:x, sy:y, cx:x, cy:y }; e.preventDefault(); }
        };

        const onMove = e => {
            if (!this.dragging) return;
            const { x, y } = getPos(e);
            this.dragging.cx = x; this.dragging.cy = y;
            this.draw(); e.preventDefault();
        };

        const onUp = e => {
            if (!this.dragging) return;
            const d  = this.dragging;
            const dx = d.sx - d.cx, dy = d.sy - d.cy;
            const dist = Math.hypot(dx, dy);
            if (dist > 6) {
                const power = Math.min(dist * 0.38, MAX_LAUNCH);
                d.marble.vx = (dx / dist) * power;
                d.marble.vy = (dy / dist) * power;
                this.isSimulating = true;
                this.runPhysics();
            }
            this.dragging = null; e.preventDefault();
        };

        canvas.addEventListener('mousedown',  onDown);
        canvas.addEventListener('mousemove',  onMove);
        canvas.addEventListener('mouseup',    onUp);
        canvas.addEventListener('touchstart', onDown, { passive:false });
        canvas.addEventListener('touchmove',  onMove, { passive:false });
        canvas.addEventListener('touchend',   onUp,   { passive:false });

        // Mode overlay
        document.getElementById('ak-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('ak-ai-select-btn').addEventListener('click', () => {
            document.getElementById('ak-step-mode').classList.add('hidden');
            document.getElementById('ak-step-diff').classList.remove('hidden');
        });
        document.getElementById('ak-easy-btn').addEventListener('click',   () => this.startGame('ai', 'easy'));
        document.getElementById('ak-normal-btn').addEventListener('click', () => this.startGame('ai', 'normal'));
        document.getElementById('ak-hard-btn').addEventListener('click',   () => this.startGame('ai', 'hard'));
        document.getElementById('ak-diff-back').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('ak-reset-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('ak-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('ak-step-mode').classList.remove('hidden');
        document.getElementById('ak-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'normal') {
        this.gameMode   = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        const blueLabel = document.getElementById('ak-blue-label');
        if (blueLabel) blueLabel.textContent = mode === 'ai' ? 'AI (파랑)' : '파랑';
        this.reset();
    }

    // ─── Physics ─────────────────────────────────────────────

    runPhysics() {
        const step = () => {
            this.update();
            this.draw();
            const moving = this.marbles.some(m => m.alive && (Math.abs(m.vx) > MIN_SPEED || Math.abs(m.vy) > MIN_SPEED));
            if (moving) {
                this.animId = requestAnimationFrame(step);
            } else {
                this.marbles.forEach(m => { m.vx = 0; m.vy = 0; });
                this.isSimulating = false;
                this.checkWin();
                if (!this.isGameOver) {
                    this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
                    this.updateStatus();
                    this.updateHighlight();
                    if (this.gameMode === 'ai' && this.currentTurn === 'blue') {
                        this.isAIThinking = true;
                        this.updateStatus();
                        const delay = this.difficulty === 'easy' ? 900 : this.difficulty === 'hard' ? 200 : 500;
                        setTimeout(() => this.executeAIShot(), delay);
                    }
                }
                this.draw();
            }
        };
        this.animId = requestAnimationFrame(step);
    }

    update() {
        const alive = this.marbles.filter(m => m.alive);

        for (const m of alive) {
            m.x += m.vx; m.y += m.vy;
            m.vx *= FRICTION; m.vy *= FRICTION;
            if (Math.abs(m.vx) < MIN_SPEED) m.vx = 0;
            if (Math.abs(m.vy) < MIN_SPEED) m.vy = 0;
        }

        for (let i = 0; i < alive.length; i++) {
            for (let j = i+1; j < alive.length; j++) {
                this.resolveCollision(alive[i], alive[j]);
            }
        }

        for (const m of this.marbles) {
            if (!m.alive) continue;
            if (m.x < this.bLeft || m.x > this.bRight || m.y < this.bTop || m.y > this.bBottom) {
                m.alive = false;
            }
        }

        this.updateCounters();
    }

    resolveCollision(a, b) {
        const dx   = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minD = a.r + b.r;
        if (dist >= minD || dist === 0) return;

        const overlap = (minD - dist) / 2;
        const nx = dx/dist, ny = dy/dist;
        a.x -= nx*overlap; a.y -= ny*overlap;
        b.x += nx*overlap; b.y += ny*overlap;

        const dot = (a.vx-b.vx)*nx + (a.vy-b.vy)*ny;
        if (dot <= 0) return;
        const imp = dot * RESTITUTION;
        a.vx -= imp*nx; a.vy -= imp*ny;
        b.vx += imp*nx; b.vy += imp*ny;
    }

    // ─── AI ──────────────────────────────────────────────────

    executeAIShot() {
        if (this.isGameOver) { this.isAIThinking = false; return; }
        const shot = this.getAIShot();
        this.isAIThinking = false;
        if (!shot) return;
        shot.marble.vx = shot.vx;
        shot.marble.vy = shot.vy;
        this.isSimulating = true;
        this.runPhysics();
    }

    getAIShot() {
        const friendly = this.marbles.filter(m => m.alive && m.color === 'blue');
        const enemies  = this.marbles.filter(m => m.alive && m.color === 'red');
        if (!friendly.length || !enemies.length) return null;

        if (this.difficulty === 'easy') {
            const fm = friendly[Math.floor(Math.random() * friendly.length)];
            const em = enemies[Math.floor(Math.random() * enemies.length)];
            const dx = em.x - fm.x, dy = em.y - fm.y;
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;
            const power = MAX_LAUNCH * (0.4 + Math.random() * 0.6);
            return { marble: fm, vx: Math.cos(angle)*power, vy: Math.sin(angle)*power };
        }

        let bestShot = null, bestScore = -Infinity;

        for (const fm of friendly) {
            for (const em of enemies) {
                const dx = em.x - fm.x, dy = em.y - fm.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 1) continue;
                const nx = dx/dist, ny = dy/dist;

                // After elastic collision, em moves in direction (nx, ny)
                const postSpeed = MAX_LAUNCH * RESTITUTION * 0.80;
                const result = this.simulateSlide(em.x, em.y, nx*postSpeed, ny*postSpeed);

                let score = result.escaped ? 100000 : (500 - Math.min(
                    result.x - this.bLeft, this.bRight  - result.x,
                    result.y - this.bTop,  this.bBottom - result.y
                ));

                if (this.difficulty === 'normal') score += (Math.random() - 0.5) * 30;

                if (score > bestScore) {
                    bestScore = score;
                    let angle = Math.atan2(ny, nx);
                    if (this.difficulty === 'normal') angle += (Math.random() - 0.5) * 0.12;
                    bestShot = { marble: fm, vx: Math.cos(angle)*MAX_LAUNCH, vy: Math.sin(angle)*MAX_LAUNCH };
                }
            }
        }
        return bestShot;
    }

    simulateSlide(x, y, vx, vy, maxSteps = 300) {
        for (let i = 0; i < maxSteps; i++) {
            x += vx; y += vy;
            vx *= FRICTION; vy *= FRICTION;
            if (Math.abs(vx) < MIN_SPEED && Math.abs(vy) < MIN_SPEED) break;
            if (x < this.bLeft || x > this.bRight || y < this.bTop || y > this.bBottom) {
                return { x, y, escaped: true };
            }
        }
        return { x, y, escaped: false };
    }

    // ─── Drawing ─────────────────────────────────────────────

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, this.W, this.H);

        this.drawBoard();

        if (this.dragging) {
            const d  = this.dragging;
            const dx = d.sx - d.cx, dy = d.sy - d.cy;
            const dist = Math.hypot(dx, dy);
            if (dist > 6) {
                const power = Math.min(dist * 0.38, MAX_LAUNCH) / MAX_LAUNCH;
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = this.currentTurn === 'red' ? '#ef4444' : '#3b82f6';
                ctx.lineWidth   = 2.5;
                ctx.setLineDash([6, 5]);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(d.marble.x, d.marble.y);
                ctx.lineTo(d.marble.x + dx*power*1.6, d.marble.y + dy*power*1.6);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        for (const m of this.marbles) {
            if (m.alive) this.drawMarble(m, this.dragging?.marble === m);
        }
    }

    drawBoard() {
        const ctx = this.ctx;
        const L   = this.bLeft, R = this.bRight, T = this.bTop, B = this.bBottom;
        const BW  = R - L, BH = B - T;

        // Outer wooden frame
        const outerGrad = ctx.createLinearGradient(0, 0, this.W, this.H);
        outerGrad.addColorStop(0, '#a86f2e');
        outerGrad.addColorStop(1, '#7a4f20');
        ctx.fillStyle = outerGrad;
        ctx.beginPath(); ctx.roundRect(0, 0, this.W, this.H, 10); ctx.fill();

        // Inner board surface
        const boardGrad = ctx.createLinearGradient(L, T, R, B);
        boardGrad.addColorStop(0, '#deae6c');
        boardGrad.addColorStop(1, '#c8903a');
        ctx.fillStyle = boardGrad;
        ctx.beginPath(); ctx.roundRect(L, T, BW, BH, 6); ctx.fill();

        // Wood grain lines
        ctx.save();
        ctx.beginPath(); ctx.roundRect(L, T, BW, BH, 6); ctx.clip();
        ctx.strokeStyle = 'rgba(90,55,20,0.12)'; ctx.lineWidth = 1;
        for (let yy = T+10; yy < B; yy += 14) {
            ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(R, yy+4); ctx.stroke();
        }
        ctx.restore();

        // 15×15 바둑판 grid (오목과 동일)
        const LINES = 15;
        const cs = Math.min(BW, BH) / (LINES - 1);
        const gL = L + (BW - cs*(LINES-1)) / 2;
        const gT = T + (BH - cs*(LINES-1)) / 2;
        const gR = gL + cs*(LINES-1);
        const gB = gT + cs*(LINES-1);

        ctx.save();
        ctx.beginPath(); ctx.roundRect(L, T, BW, BH, 6); ctx.clip();

        ctx.strokeStyle = 'rgba(80,45,10,0.55)'; ctx.lineWidth = 1;
        for (let i = 0; i < LINES; i++) {
            // Horizontal
            ctx.beginPath(); ctx.moveTo(gL, gT+i*cs); ctx.lineTo(gR, gT+i*cs); ctx.stroke();
            // Vertical
            ctx.beginPath(); ctx.moveTo(gL+i*cs, gT); ctx.lineTo(gL+i*cs, gB); ctx.stroke();
        }

        // 화점 — 오목 표준 위치: 3, 7, 11 (0-indexed on 15×15)
        ctx.fillStyle = 'rgba(80,45,10,0.65)';
        for (const i of [3, 7, 11]) {
            for (const j of [3, 7, 11]) {
                ctx.beginPath();
                ctx.arc(gL+i*cs, gT+j*cs, 4, 0, Math.PI*2);
                ctx.fill();
            }
        }

        ctx.restore();

        // Inner border shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(L, T, BW, BH, 6); ctx.stroke();
    }

    drawMarble(m, selected) {
        const ctx = this.ctx;
        const r   = m.r;

        ctx.save();
        ctx.shadowColor   = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur    = 10;
        ctx.shadowOffsetY = 4;

        const grad = ctx.createRadialGradient(m.x - r*0.3, m.y - r*0.3, r*0.08, m.x, m.y, r);
        if (m.color === 'red') {
            grad.addColorStop(0, '#ffaaaa'); grad.addColorStop(0.45, '#ef4444'); grad.addColorStop(1, '#7f1d1d');
        } else {
            grad.addColorStop(0, '#a5c8ff'); grad.addColorStop(0.45, '#3b82f6'); grad.addColorStop(1, '#1e3a8a');
        }
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        ctx.save(); ctx.globalAlpha = 0.45;
        const shine = ctx.createRadialGradient(m.x-r*0.35, m.y-r*0.35, r*0.04, m.x-r*0.2, m.y-r*0.2, r*0.65);
        shine.addColorStop(0, 'rgba(255,255,255,0.9)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        if (selected) {
            ctx.save();
            ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3;
            ctx.shadowColor = '#facc15'; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(m.x, m.y, r+5, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
        }
    }

    // ─── Win / UI ─────────────────────────────────────────────

    checkWin() {
        const redAlive  = this.marbles.filter(m => m.color==='red'  && m.alive).length;
        const blueAlive = this.marbles.filter(m => m.color==='blue' && m.alive).length;
        if (redAlive === 0 || blueAlive === 0) {
            this.isGameOver = true;
            const winnerColor = blueAlive === 0 ? 'red' : 'blue';
            setTimeout(() => {
                let title, desc;
                if (this.gameMode === 'ai') {
                    if (winnerColor === 'red') {
                        title = '승리!'; desc = '당신이 상대 구슬을 모두 밀어냈습니다!';
                    } else {
                        title = '패배...'; desc = 'AI가 당신의 구슬을 모두 밀어냈습니다.';
                    }
                } else {
                    const name = winnerColor === 'red' ? '빨강' : '파랑';
                    title = '승리!'; desc = `${name}이 상대 구슬을 모두 밀어냈습니다!`;
                }
                this.winTitle.textContent = title;
                this.winTitle.style.background = winnerColor === 'red'
                    ? 'linear-gradient(to right,#ef4444,#dc2626)'
                    : 'linear-gradient(to right,#3b82f6,#1d4ed8)';
                this.winTitle.style.webkitBackgroundClip = 'text';
                this.winTitle.style.backgroundClip = 'text';
                this.winTitle.style.webkitTextFillColor = 'transparent';
                this.winDesc.textContent = desc;
                this.winOverlay.classList.remove('hidden');
            }, 500);
        }
    }

    updateCounters() {
        const red  = this.marbles.filter(m => m.color==='red'  && m.alive).length;
        const blue = this.marbles.filter(m => m.color==='blue' && m.alive).length;
        document.getElementById('ak-red-count').textContent  = red;
        document.getElementById('ak-blue-count').textContent = blue;
    }

    updateStatus() {
        if (this.isAIThinking) {
            this.statusEl.textContent = 'AI 생각중...';
        } else {
            this.statusEl.textContent = this.currentTurn === 'red' ? '빨강의 차례입니다' : '파랑의 차례입니다';
        }
    }

    updateHighlight() {
        document.getElementById('ak-player-red').classList.toggle('active',  this.currentTurn === 'red');
        document.getElementById('ak-player-blue').classList.toggle('active', this.currentTurn === 'blue');
    }
}

window.alkkagiGame = new AlkkagiGame();
