const FRICTION    = 0.960;
const RESTITUTION = 0.90;
const MIN_SPEED   = 0.20;
const MAX_LAUNCH  = 20;
const BOARD_SIZE   = 560;
const BM          = 18; // board margin (wooden frame width)

class AlkkagiGame {
    constructor() {
        this.canvas = document.getElementById('alkkagi-canvas');
        this.ctx    = this.canvas.getContext('2d');

        this.marbles = [];
        this.obstacles   = [];       // 익스트림 모드 고정 장애물
        this.variant     = 'classic'; // 'classic' | 'extreme'
        this.turnColor    = 'red';
        this.isGameOver   = false;
        this.isSimulating = false;
        this.isAIThinking = false;
        this.gameMode     = 'pvp';
        this.difficulty   = 'normal';
        this.animId = null;
        this.dragging = null;
        this.inputLocked = false; // 온라인 대전: 내 차례가 아니면 true
        this.hooks = {};
        this.onGameOver = null; // 온라인 대전: 대국 종료를 알리는 훅

        this.statusEl    = document.getElementById('ak-status');
        this.subtitleEl  = document.getElementById('ak-subtitle');
        this.winOverlay  = document.getElementById('ak-win-overlay');
        this.winTitle    = document.getElementById('ak-win-title');
        this.winDesc     = document.getElementById('ak-win-desc');
        this.modeOverlay = document.getElementById('ak-mode-overlay');

        this.initAudio();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
    }

    // ─── 효과음 ──────────────────────────────────────────────

    initAudio() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioCtx();
        } catch (e) {
            this.audioCtx = null;
        }
    }

    resumeAudio() {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    // 구슬 충돌음. intensity(충돌 속도)에 따라 세기가 달라지고,
    // isStone이면 익스트림 모드 장애물에 부딪힌 더 둔탁한 소리를 낸다.
    playHitSound(intensity, isStone = false) {
        if (!this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const vol = Math.min(0.55, 0.15 + intensity * 0.035);

        const bufSize = Math.floor(ctx.sampleRate * (isStone ? 0.05 : 0.035));
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = isStone ? 900 : 2200;
        filter.Q.value = 1.2;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (isStone ? 0.09 : 0.06));

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
    }

    // 구슬이 보드 밖으로 떨어질 때 나는 낮게 꺼지는 소리
    playOutSound() {
        if (!this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.28);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
    }

    get R() {
        return Math.max(12, Math.min(Math.floor(Math.min(this.W, this.H) / 14), 22));
    }

    get bLeft()   { return BM; }
    get bRight()  { return this.W - BM; }
    get bTop()    { return BM; }
    get bBottom() { return this.H - BM; }

    resize() {
        this.W = BOARD_SIZE;
        this.H = BOARD_SIZE;   // fixed game coordinates so mobile and desktop play identically
        this.canvas.width  = this.W;
        this.canvas.height = this.H;
        const displaySize = Math.max(280, Math.min(window.innerWidth - 32, BOARD_SIZE));
        this.canvas.style.width = displaySize + 'px';
        this.canvas.style.height = displaySize + 'px';

        this.draw();
    }

    reset() {
        cancelAnimationFrame(this.animId);
        this.isGameOver   = false;
        this.isSimulating = false;
        this.isAIThinking = false;
        this.dragging     = null;
        this.turnColor    = 'red';

        const R  = this.R;
        const bW = this.bRight  - this.bLeft;
        const bH = this.bBottom - this.bTop;
        const spacing = bH / 6;

        this.marbles = [];
        for (let i = 0; i < 5; i++) {
            this.marbles.push({ color:'red',  x: this.bLeft  + bW*0.15, y: this.bTop + spacing*(i+0.5) + spacing*0.1, vx:0, vy:0, r:R, alive:true });
            this.marbles.push({ color:'blue', x: this.bRight - bW*0.15, y: this.bTop + spacing*(i+0.5) + spacing*0.1, vx:0, vy:0, r:R, alive:true });
        }

        // 익스트림 모드: 보드 중앙에 세로로 고정 장애물 3개(양쪽 구슬 열과는 충분히 떨어진 위치)
        this.obstacles = [];
        if (this.variant === 'extreme') {
            const cx = (this.bLeft + this.bRight) / 2;
            const cy = (this.bTop + this.bBottom) / 2;
            const OR = R * 1.15;
            const gap = bH * 0.22;
            this.obstacles = [
                { x: cx, y: cy,        r: OR },
                { x: cx, y: cy - gap,  r: OR },
                { x: cx, y: cy + gap,  r: OR },
            ];
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
            const src  = (e.touches && e.touches.length)
                ? e.touches[0]
                : (e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e);
            return { x: (src.clientX - rect.left)*sx, y: (src.clientY - rect.top)*sy };
        };

        const onDown = e => {
            if (this.isGameOver || this.isSimulating || this.isAIThinking) return;
            if (this.gameMode === 'ai' && this.turnColor === 'blue') return;
            if (this.gameMode === 'online' && this.inputLocked) return;
            this.resumeAudio();
            const { x, y } = getPos(e);
            const m = this.marbles.find(m =>
                m.alive && m.color === this.turnColor &&
                Math.hypot(m.x - x, m.y - y) <= m.r * 1.8
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
                const vx = (dx / dist) * power;
                const vy = (dy / dist) * power;
                d.marble.vx = vx;
                d.marble.vy = vy;
                this.isSimulating = true;
                const marbleIndex = this.marbles.indexOf(d.marble);
                this.runPhysics({ marbleIndex, vx, vy });
            }
            this.dragging = null; e.preventDefault();
        };

        // 시작(누르기)은 캔버스에서만, 이동·놓기는 window에서 감지해
        // 커서가 보드를 벗어나도 조준이 끊기지 않게 함
        canvas.addEventListener('mousedown',  onDown);
        window.addEventListener('mousemove',  onMove);
        window.addEventListener('mouseup',    onUp);
        canvas.addEventListener('touchstart', onDown, { passive:false });
        window.addEventListener('touchmove',  onMove, { passive:false });
        window.addEventListener('touchend',   onUp,   { passive:false });

        // Mode overlay — 1단계: 게임 방식(클래식/익스트림)
        document.getElementById('ak-classic-btn').addEventListener('click', () => {
            this.variant = 'classic';
            document.getElementById('ak-step-variant').classList.add('hidden');
            document.getElementById('ak-step-mode').classList.remove('hidden');
        });
        document.getElementById('ak-extreme-btn').addEventListener('click', () => {
            this.variant = 'extreme';
            document.getElementById('ak-step-variant').classList.add('hidden');
            document.getElementById('ak-step-mode').classList.remove('hidden');
        });
        document.getElementById('ak-mode-back').addEventListener('click', () => {
            document.getElementById('ak-step-mode').classList.add('hidden');
            document.getElementById('ak-step-variant').classList.remove('hidden');
        });

        // Mode overlay — 2단계: 대전 방식(1:1/AI)
        document.getElementById('ak-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('ak-ai-select-btn').addEventListener('click', () => {
            document.getElementById('ak-step-mode').classList.add('hidden');
            document.getElementById('ak-step-diff').classList.remove('hidden');
        });
        document.getElementById('ak-online-select-btn').addEventListener('click', () => {
            document.getElementById('ak-step-mode').classList.add('hidden');
            document.getElementById('ak-step-online').classList.remove('hidden');
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
        document.getElementById('ak-step-variant').classList.remove('hidden');
        document.getElementById('ak-step-mode').classList.add('hidden');
        document.getElementById('ak-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'normal') {
        this.gameMode   = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        const blueLabel = document.getElementById('ak-blue-label');
        if (blueLabel) blueLabel.textContent = mode === 'ai' ? window.i18n.t('ak.ai.blue') : window.i18n.t('ak.blue');
        if (this.subtitleEl) {
            this.subtitleEl.textContent = window.i18n.t(this.variant === 'extreme' ? 'ak.subtitle.extreme' : 'ak.subtitle.classic');
        }
        this.reset();
    }

    // ─── Physics ─────────────────────────────────────────────

    // shotInfo: {marbleIndex,vx,vy} — 훅으로 상대에게 보낼 발사 정보(로컬 발사일 때만).
    // opts.remote: 상대가 쏜 수를 재생하는 중이면 true(훅을 다시 쏘지 않는다).
    // opts.finalState: 상대 클라이언트가 이미 계산한 최종 구슬 상태 — 물리는 결정론적이라
    // 거의 항상 이미 같은 결과지만, 부동소수점 오차 누적에 대비해 정지 후 조용히 맞춘다.
    runPhysics(shotInfo, opts) {
        const step = () => {
            this.update();
            this.draw();
            const moving = this.marbles.some(m => m.alive && (Math.abs(m.vx) > MIN_SPEED || Math.abs(m.vy) > MIN_SPEED));
            if (moving) {
                this.animId = requestAnimationFrame(step);
            } else {
                this.marbles.forEach(m => { m.vx = 0; m.vy = 0; });
                this.isSimulating = false;

                if (opts?.remote && opts?.finalState) {
                    this.marbles = opts.finalState.marbles.map(m => ({ ...m }));
                }

                this.checkWin();
                if (!this.isGameOver) {
                    this.turnColor = this.turnColor === 'red' ? 'blue' : 'red';
                    this.updateStatus();
                    this.updateHighlight();
                    if (this.gameMode === 'ai' && this.turnColor === 'blue') {
                        this.isAIThinking = true;
                        this.updateStatus();
                        const delay = this.difficulty === 'easy' ? 900 : this.difficulty === 'hard' ? 200 : 500;
                        setTimeout(() => this.executeAIShot(), delay);
                    }
                }
                this.draw();

                if (!opts?.remote && shotInfo && this.hooks.afterMove) {
                    this.hooks.afterMove(shotInfo);
                }
                // 온라인 대전(상대 수 재생): multiplayer.js가 이 시점 이후에야
                // 정확한 턴으로 입력 잠금을 다시 계산할 수 있다 — 재생 중간에
                // 계산하면 아직 안 넘어간 턴 기준으로 잠겨서 내 차례가 와도
                // 드래그가 안 먹는다.
                opts?.onSettled?.();
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

        for (const m of alive) {
            for (const o of this.obstacles) {
                this.resolveObstacleHit(m, o);
            }
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
                this.playOutSound();
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
        this.playHitSound(dot);
    }

    // 고정 장애물(익스트림 모드)과의 충돌. 장애물은 움직이지 않으므로
    // 운동량 변화는 전부 구슬 쪽에 반사(reflection)로 적용한다.
    resolveObstacleHit(m, o) {
        const dx = m.x - o.x, dy = m.y - o.y;
        const dist = Math.hypot(dx, dy);
        const minD = m.r + o.r;
        if (dist >= minD || dist === 0) return;

        const nx = dx/dist, ny = dy/dist;
        m.x = o.x + nx*minD; m.y = o.y + ny*minD;

        const dot = m.vx*nx + m.vy*ny;
        if (dot >= 0) return; // 이미 멀어지는 중이면 반사하지 않음
        const j = -(1 + RESTITUTION) * dot;
        m.vx += j*nx; m.vy += j*ny;
        this.playHitSound(-dot, true);
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

    // ponytail: AI 조준 시 "지름길로 곧장 갈 수 있는지"(장애물에 막히지 않는지)까지는
    // 확인하지 않는다. 충돌 후 미끄러지는 경로에서 장애물에 튕기는 것만 반영한다.
    // 익스트림 모드에서 AI가 가끔 기둥에 막혀 헛스윙하는 건 의도된 변수로 남겨둔다.
    simulateSlide(x, y, vx, vy, maxSteps = 300) {
        for (let i = 0; i < maxSteps; i++) {
            x += vx; y += vy;
            vx *= FRICTION; vy *= FRICTION;
            for (const o of this.obstacles) {
                const dx = x - o.x, dy = y - o.y;
                const dist = Math.hypot(dx, dy);
                const minD = this.R + o.r;
                if (dist < minD && dist > 0) {
                    const nx = dx/dist, ny = dy/dist;
                    x = o.x + nx*minD; y = o.y + ny*minD;
                    const dot = vx*nx + vy*ny;
                    if (dot < 0) { const j = -(1+RESTITUTION)*dot; vx += j*nx; vy += j*ny; }
                }
            }
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
        if (this.obstacles.length) this.drawObstacles();

        if (this.dragging) {
            const d  = this.dragging;
            const dx = d.sx - d.cx, dy = d.sy - d.cy;
            const dist = Math.hypot(dx, dy);
            if (dist > 6) {
                const power = Math.min(dist * 0.38, MAX_LAUNCH) / MAX_LAUNCH;
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = this.turnColor === 'red' ? '#ef4444' : '#3b82f6';
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

    drawObstacles() {
        const ctx = this.ctx;
        for (const o of this.obstacles) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;
            const grad = ctx.createRadialGradient(o.x - o.r*0.3, o.y - o.r*0.3, o.r*0.1, o.x, o.y, o.r);
            grad.addColorStop(0, '#9ca3af'); grad.addColorStop(0.5, '#4b5563'); grad.addColorStop(1, '#1f2937');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = 'rgba(251,191,36,0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 2, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
        }
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
                        title = window.i18n.t('game.win'); desc = window.i18n.t('ak.you.win');
                    } else {
                        title = window.i18n.t('game.lose'); desc = window.i18n.t('ak.ai.win');
                    }
                } else {
                    title = window.i18n.t('game.win');
                    desc = winnerColor === 'red' ? window.i18n.t('ak.red.win') : window.i18n.t('ak.blue.win');
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
                if (this.gameMode === 'online' && this.onGameOver) this.onGameOver();
            }, 500);
        }
    }

    // 온라인 대전: 재대결·상대나가기 시 판만 초기화한다(모드 화면은 건드리지 않음).
    resetGame() {
        this.reset();
    }

    // multiplayer.js가 세션 색('black'/'white', 오목 기준 좌석 라벨)과 비교하는 데 쓴다.
    // 알까기는 빨강이 선공이라 DO 좌석 'black'(선공)을 빨강에 대응시킨다.
    get currentTurn() {
        return this.turnColor === 'red' ? 'black' : 'white';
    }

    updateCounters() {
        const red  = this.marbles.filter(m => m.color==='red'  && m.alive).length;
        const blue = this.marbles.filter(m => m.color==='blue' && m.alive).length;
        document.getElementById('ak-red-count').textContent  = red;
        document.getElementById('ak-blue-count').textContent = blue;
    }

    updateStatus() {
        if (this.isAIThinking) {
            this.statusEl.textContent = window.i18n.t('game.ai.thinking');
        } else {
            this.statusEl.textContent = this.turnColor === 'red' ? window.i18n.t('ak.red.turn') : window.i18n.t('ak.blue.turn');
        }
    }

    refreshLang() {
        const blueLabel = document.getElementById('ak-blue-label');
        if (blueLabel) blueLabel.textContent = this.gameMode === 'ai' ? window.i18n.t('ak.ai.blue') : window.i18n.t('ak.blue');
        if (this.subtitleEl) {
            this.subtitleEl.textContent = window.i18n.t(this.variant === 'extreme' ? 'ak.subtitle.extreme' : 'ak.subtitle.classic');
        }
        if (!this.isGameOver) this.updateStatus();
    }

    updateHighlight() {
        document.getElementById('ak-player-red').classList.toggle('active',  this.turnColor === 'red');
        document.getElementById('ak-player-blue').classList.toggle('active', this.turnColor === 'blue');
    }
}

window.alkkagiGame = new AlkkagiGame();
