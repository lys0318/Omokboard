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
        this.animId = null;
        this.dragging = null;

        this.statusEl   = document.getElementById('ak-status');
        this.winOverlay = document.getElementById('ak-win-overlay');
        this.winTitle   = document.getElementById('ak-win-title');
        this.winDesc    = document.getElementById('ak-win-desc');

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
        this.reset();
    }

    get R() {
        return Math.max(16, Math.min(Math.floor(Math.min(this.W, this.H) / 11), 26));
    }

    // Inner board bounds (inside wooden frame)
    get bLeft()   { return BM; }
    get bRight()  { return this.W - BM; }
    get bTop()    { return BM; }
    get bBottom() { return this.H - BM; }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 580);
        this.W = maxW;
        this.H = Math.round(maxW * 0.55);
        this.canvas.width  = this.W;
        this.canvas.height = this.H;
        if (this.marbles.length) this.reset();
        else this.draw();
    }

    reset() {
        cancelAnimationFrame(this.animId);
        this.isGameOver   = false;
        this.isSimulating = false;
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
            const rect  = canvas.getBoundingClientRect();
            const sx    = canvas.width  / rect.width;
            const sy    = canvas.height / rect.height;
            const src   = e.touches ? e.touches[0] : e;
            return { x: (src.clientX - rect.left)*sx, y: (src.clientY - rect.top)*sy };
        };

        const onDown = e => {
            if (this.isGameOver || this.isSimulating) return;
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

        document.getElementById('ak-reset-btn').addEventListener('click', () => this.reset());
        document.getElementById('ak-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden'); this.reset();
        });
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
                }
                this.draw();
            }
        };
        this.animId = requestAnimationFrame(step);
    }

    update() {
        const alive = this.marbles.filter(m => m.alive);

        // Move & apply friction
        for (const m of alive) {
            m.x += m.vx; m.y += m.vy;
            m.vx *= FRICTION; m.vy *= FRICTION;
            if (Math.abs(m.vx) < MIN_SPEED) m.vx = 0;
            if (Math.abs(m.vy) < MIN_SPEED) m.vy = 0;
        }

        // Marble–marble elastic collision
        for (let i = 0; i < alive.length; i++) {
            for (let j = i+1; j < alive.length; j++) {
                this.resolveCollision(alive[i], alive[j]);
            }
        }

        // Eliminate marble when its CENTER crosses the board edge
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

        // Separate
        const overlap = (minD - dist) / 2;
        const nx = dx/dist, ny = dy/dist;
        a.x -= nx*overlap; a.y -= ny*overlap;
        b.x += nx*overlap; b.y += ny*overlap;

        // Impulse (equal mass)
        const dot = (a.vx-b.vx)*nx + (a.vy-b.vy)*ny;
        if (dot <= 0) return;
        const imp = dot * RESTITUTION;
        a.vx -= imp*nx; a.vy -= imp*ny;
        b.vx += imp*nx; b.vy += imp*ny;
    }

    // ─── Drawing ─────────────────────────────────────────────

    draw() {
        const ctx = this.ctx;
        const W = this.W, H = this.H;
        ctx.clearRect(0, 0, W, H);

        // Canvas background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);

        this.drawBoard();

        // Drag arrow
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
                ctx.lineTo(d.marble.x + dx * power * 1.6, d.marble.y + dy * power * 1.6);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // Marbles
        for (const m of this.marbles) {
            if (m.alive) this.drawMarble(m, this.dragging?.marble === m);
        }
    }

    drawBoard() {
        const ctx = this.ctx;
        const L = this.bLeft, R = this.bRight, T = this.bTop, B = this.bBottom;
        const BW = R - L, BH = B - T;

        // Wooden frame (outer)
        const outerGrad = ctx.createLinearGradient(0, 0, this.W, this.H);
        outerGrad.addColorStop(0, '#a86f2e');
        outerGrad.addColorStop(1, '#7a4f20');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.roundRect(0, 0, this.W, this.H, 10);
        ctx.fill();

        // Inner board surface
        const boardGrad = ctx.createLinearGradient(L, T, R, B);
        boardGrad.addColorStop(0, '#deae6c');
        boardGrad.addColorStop(1, '#c8903a');
        ctx.fillStyle = boardGrad;
        ctx.beginPath();
        ctx.roundRect(L, T, BW, BH, 6);
        ctx.fill();

        // Subtle wood grain lines
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(L, T, BW, BH, 6);
        ctx.clip();
        ctx.strokeStyle = 'rgba(90,55,20,0.12)';
        ctx.lineWidth = 1;
        for (let yy = T + 10; yy < B; yy += 14) {
            ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(R, yy + 4); ctx.stroke();
        }
        ctx.restore();

        // Center divider line
        const cx = (L + R) / 2;
        ctx.strokeStyle = 'rgba(90,55,20,0.25)';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(cx, T + 8); ctx.lineTo(cx, B - 8);
        ctx.stroke();
        ctx.setLineDash([]);

        // Inner border shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.roundRect(L, T, BW, BH, 6);
        ctx.stroke();
    }

    drawMarble(m, selected) {
        const ctx = this.ctx;
        const r   = m.r;

        ctx.save();
        ctx.shadowColor  = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur   = 10;
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

        // Shine
        ctx.save();
        ctx.globalAlpha = 0.45;
        const shine = ctx.createRadialGradient(m.x - r*0.35, m.y - r*0.35, r*0.04, m.x - r*0.2, m.y - r*0.2, r*0.65);
        shine.addColorStop(0, 'rgba(255,255,255,0.9)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        // Selection ring
        if (selected) {
            ctx.save();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth   = 3;
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur  = 12;
            ctx.beginPath(); ctx.arc(m.x, m.y, r + 5, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
        }
    }

    // ─── Win / UI ─────────────────────────────────────────────

    checkWin() {
        const redAlive  = this.marbles.filter(m => m.color==='red'  && m.alive).length;
        const blueAlive = this.marbles.filter(m => m.color==='blue' && m.alive).length;
        if (redAlive === 0 || blueAlive === 0) {
            this.isGameOver = true;
            const winner = blueAlive === 0 ? '빨강' : '파랑';
            setTimeout(() => {
                this.winTitle.textContent = '승리!';
                this.winTitle.style.background = winner === '빨강'
                    ? 'linear-gradient(to right,#ef4444,#dc2626)'
                    : 'linear-gradient(to right,#3b82f6,#1d4ed8)';
                this.winTitle.style.webkitBackgroundClip = 'text';
                this.winTitle.style.backgroundClip = 'text';
                this.winTitle.style.webkitTextFillColor = 'transparent';
                this.winDesc.textContent = `${winner}이 상대 구슬을 모두 밀어냈습니다!`;
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
        this.statusEl.textContent = this.currentTurn === 'red' ? '빨강의 차례입니다' : '파랑의 차례입니다';
    }

    updateHighlight() {
        document.getElementById('ak-player-red').classList.toggle('active',  this.currentTurn === 'red');
        document.getElementById('ak-player-blue').classList.toggle('active', this.currentTurn === 'blue');
    }
}

window.alkkagiGame = new AlkkagiGame();
