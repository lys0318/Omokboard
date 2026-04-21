const FRICTION = 0.985;
const RESTITUTION = 0.92;
const MIN_SPEED = 0.15;
const MAX_LAUNCH = 18;
const MARBLE_R = 22;

class AlkkagiGame {
    constructor() {
        this.canvas = document.getElementById('alkkagi-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.marbles = [];
        this.currentTurn = 'red';   // 'red' | 'blue'
        this.isGameOver = false;
        this.animId = null;

        // Drag state
        this.dragging = null;   // { marble, startX, startY, curX, curY }
        this.isSimulating = false;

        this.statusEl   = document.getElementById('ak-status');
        this.winOverlay = document.getElementById('ak-win-overlay');
        this.winTitle   = document.getElementById('ak-win-title');
        this.winDesc    = document.getElementById('ak-win-desc');

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
        this.reset();
    }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 560);
        this.W = maxW;
        this.H = Math.round(maxW * 0.6);
        this.canvas.width  = this.W;
        this.canvas.height = this.H;
        if (this.marbles.length) this.draw();
    }

    reset() {
        cancelAnimationFrame(this.animId);
        this.isGameOver  = false;
        this.isSimulating = false;
        this.dragging    = null;
        this.currentTurn = 'red';

        const W = this.W, H = this.H, R = MARBLE_R;
        const spacing = H / 6;
        this.marbles = [];

        // Red: left side
        for (let i = 0; i < 5; i++) {
            this.marbles.push({ color:'red',  x: W*0.15, y: spacing*(i+0.5) + spacing*0.25, vx:0, vy:0, r:R, alive:true });
        }
        // Blue: right side
        for (let i = 0; i < 5; i++) {
            this.marbles.push({ color:'blue', x: W*0.85, y: spacing*(i+0.5) + spacing*0.25, vx:0, vy:0, r:R, alive:true });
        }

        this.updateCounters();
        this.updateStatus();
        this.updatePlayerHighlight();
        this.draw();
    }

    bindEvents() {
        const canvas = this.canvas;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width  / rect.width;
            const scaleY = canvas.height / rect.height;
            const src = e.touches ? e.touches[0] : e;
            return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
        };

        const onDown = (e) => {
            if (this.isGameOver || this.isSimulating) return;
            const { x, y } = getPos(e);
            const m = this.marbles.find(m => m.alive && m.color === this.currentTurn
                && Math.hypot(m.x - x, m.y - y) <= m.r * 1.3);
            if (m) {
                this.dragging = { marble: m, startX: x, startY: y, curX: x, curY: y };
                e.preventDefault();
            }
        };

        const onMove = (e) => {
            if (!this.dragging) return;
            const { x, y } = getPos(e);
            this.dragging.curX = x;
            this.dragging.curY = y;
            this.draw();
            e.preventDefault();
        };

        const onUp = (e) => {
            if (!this.dragging) return;
            const d = this.dragging;
            const dx = d.startX - d.curX;
            const dy = d.startY - d.curY;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                const power = Math.min(dist * 0.35, MAX_LAUNCH);
                d.marble.vx = (dx / dist) * power;
                d.marble.vy = (dy / dist) * power;
                this.isSimulating = true;
                this.runPhysics();
            }
            this.dragging = null;
            e.preventDefault();
        };

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseup',   onUp);
        canvas.addEventListener('touchstart', onDown, { passive: false });
        canvas.addEventListener('touchmove',  onMove, { passive: false });
        canvas.addEventListener('touchend',   onUp,   { passive: false });

        document.getElementById('ak-reset-btn').addEventListener('click', () => this.reset());
        document.getElementById('ak-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.reset();
        });
    }

    // ─── Physics loop ─────────────────────────────────────────

    runPhysics() {
        const step = () => {
            this.update();
            this.draw();

            const anyMoving = this.marbles.some(m => m.alive && (Math.abs(m.vx) > MIN_SPEED || Math.abs(m.vy) > MIN_SPEED));
            if (anyMoving) {
                this.animId = requestAnimationFrame(step);
            } else {
                // Stop all
                this.marbles.forEach(m => { m.vx = 0; m.vy = 0; });
                this.isSimulating = false;
                this.checkWin();
                if (!this.isGameOver) {
                    this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
                    this.updateStatus();
                    this.updatePlayerHighlight();
                }
                this.draw();
            }
        };
        this.animId = requestAnimationFrame(step);
    }

    update() {
        const alive = this.marbles.filter(m => m.alive);

        // Move & friction
        for (const m of alive) {
            m.x += m.vx;
            m.y += m.vy;
            m.vx *= FRICTION;
            m.vy *= FRICTION;
            if (Math.abs(m.vx) < MIN_SPEED) m.vx = 0;
            if (Math.abs(m.vy) < MIN_SPEED) m.vy = 0;
        }

        // Wall bounce (board edge)
        for (const m of alive) {
            if (m.x - m.r < 0)      { m.x = m.r;         m.vx = Math.abs(m.vx) * RESTITUTION; }
            if (m.x + m.r > this.W) { m.x = this.W - m.r; m.vx = -Math.abs(m.vx) * RESTITUTION; }
            if (m.y - m.r < 0)      { m.y = m.r;          m.vy = Math.abs(m.vy) * RESTITUTION; }
            if (m.y + m.r > this.H) { m.y = this.H - m.r; m.vy = -Math.abs(m.vy) * RESTITUTION; }
        }

        // Marble-marble collisions
        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                this.resolveCollision(alive[i], alive[j]);
            }
        }

        // Out-of-bounds kill: marble completely outside
        for (const m of this.marbles) {
            if (!m.alive) continue;
            if (m.x + m.r < 0 || m.x - m.r > this.W || m.y + m.r < 0 || m.y - m.r > this.H) {
                m.alive = false;
            }
        }

        this.updateCounters();
    }

    resolveCollision(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;
        if (dist >= minDist || dist === 0) return;

        // Separate
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        // Exchange velocity along normal (equal mass elastic)
        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const dot = dvx * nx + dvy * ny;
        if (dot <= 0) return;

        const impulse = dot * RESTITUTION;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
    }

    // ─── Drawing ─────────────────────────────────────────────

    draw() {
        const ctx = this.ctx;
        const W = this.W, H = this.H;
        ctx.clearRect(0, 0, W, H);

        // Board background
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#1e293b');
        bg.addColorStop(1, '#0f172a');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(0, 0, W, H, 12);
        ctx.fill();

        // Center line
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
        ctx.stroke();
        ctx.setLineDash([]);

        // Board border
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(1, 1, W-2, H-2, 12);
        ctx.stroke();

        // Drag arrow
        if (this.dragging) {
            const d = this.dragging;
            const dx = d.startX - d.curX;
            const dy = d.startY - d.curY;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                const power = Math.min(dist * 0.35, MAX_LAUNCH) / MAX_LAUNCH;
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.strokeStyle = this.currentTurn === 'red' ? '#ef4444' : '#3b82f6';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.moveTo(d.marble.x, d.marble.y);
                ctx.lineTo(d.marble.x + dx * power * 1.5, d.marble.y + dy * power * 1.5);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // Marbles
        for (const m of this.marbles) {
            if (!m.alive) continue;
            const isSelected = this.dragging && this.dragging.marble === m;
            this.drawMarble(m, isSelected);
        }
    }

    drawMarble(m, selected) {
        const ctx = this.ctx;
        const r = m.r;

        // Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        // Body gradient
        const grad = ctx.createRadialGradient(m.x - r*0.3, m.y - r*0.3, r*0.1, m.x, m.y, r);
        if (m.color === 'red') {
            grad.addColorStop(0, '#ff8080');
            grad.addColorStop(0.5, '#ef4444');
            grad.addColorStop(1, '#7f1d1d');
        } else {
            grad.addColorStop(0, '#93c5fd');
            grad.addColorStop(0.5, '#3b82f6');
            grad.addColorStop(1, '#1e3a8a');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Highlight
        ctx.save();
        ctx.globalAlpha = 0.5;
        const shine = ctx.createRadialGradient(m.x - r*0.35, m.y - r*0.35, r*0.05, m.x - r*0.2, m.y - r*0.2, r*0.6);
        shine.addColorStop(0, 'rgba(255,255,255,0.8)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Selection ring
        if (selected) {
            ctx.save();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(m.x, m.y, r + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ─── Win / UI ─────────────────────────────────────────────

    checkWin() {
        const redAlive  = this.marbles.filter(m => m.color === 'red'  && m.alive).length;
        const blueAlive = this.marbles.filter(m => m.color === 'blue' && m.alive).length;

        if (redAlive === 0 || blueAlive === 0) {
            this.isGameOver = true;
            const winner = blueAlive === 0 ? '빨강' : '파랑';
            setTimeout(() => {
                this.winTitle.textContent = '승리!';
                this.winTitle.style.background = winner === '빨강'
                    ? 'linear-gradient(to right, #ef4444, #dc2626)'
                    : 'linear-gradient(to right, #3b82f6, #1d4ed8)';
                this.winTitle.style.webkitBackgroundClip = 'text';
                this.winTitle.style.webkitTextFillColor  = 'transparent';
                this.winTitle.style.backgroundClip = 'text';
                this.winDesc.textContent = `${winner}이 모든 구슬을 밀어냈습니다!`;
                this.winOverlay.classList.remove('hidden');
            }, 400);
        }
    }

    updateCounters() {
        const red  = this.marbles.filter(m => m.color === 'red'  && m.alive).length;
        const blue = this.marbles.filter(m => m.color === 'blue' && m.alive).length;
        document.getElementById('ak-red-count').textContent  = red;
        document.getElementById('ak-blue-count').textContent = blue;
    }

    updateStatus() {
        this.statusEl.textContent = this.currentTurn === 'red' ? '빨강의 차례입니다' : '파랑의 차례입니다';
    }

    updatePlayerHighlight() {
        document.getElementById('ak-player-red').classList.toggle('active',  this.currentTurn === 'red');
        document.getElementById('ak-player-blue').classList.toggle('active', this.currentTurn === 'blue');
    }
}

window.alkkagiGame = new AlkkagiGame();
