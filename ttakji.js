// 딱지치기: 판정식·AI(TtakjiCore, DOM 없음)와 화면(TtakjiGame, 캔버스).
// 판정: 친 위치(바닥 딱지 기준 가장자리까지의 거리)와 세기로 뒤집힐 확률을 정하고, 난수 하나로 결과를 정한다.
// 온라인에서는 난수만 서버가 정하고(worker/ttakji.mjs) 판정은 양쪽 브라우저가 이 식으로 똑같이 한다.
const TtakjiCore = (() => {
    const BOARD = 400;            // 가상 판 (화면 크기와 상관없이 이 좌표로 계산)
    const CENTER = BOARD / 2;
    const TILE = 140;             // 바닥 딱지 한 변
    const MAX_CHANCE = 0.92;
    // 바닥 딱지 각도: 몇 번째로 놓인 딱지인가(k)로 정한다 → 온라인 양쪽이 항상 같다
    const ANGLES = [-8, 12, -15, 5, 18, -3, 10, -12, 7, -18];
    const tileAngle = (k) => ANGLES[((k % ANGLES.length) + ANGLES.length) % ANGLES.length];

    // 위치 점수: 가운데 0, 가장자리 1, 바깥 > 1. 가장자리 바로 안쪽(0.85~1)이 가장 잘 뒤집히고,
    // 살짝 바깥은 바람으로만, 1.6을 넘으면 헛손질. (오목보드의 판정 규칙이지 실제 물리값이 아니다)
    const EDGE = [[0, 0.12], [0.5, 0.3], [0.85, 1], [1, 1], [1.15, 0.6], [1.6, 0]];
    function edgeScore(m) {
        if (m >= 1.6) return 0;
        for (let i = 1; i < EDGE.length; i++) {
            const [a, ea] = EDGE[i - 1], [b, eb] = EDGE[i];
            if (m <= b) return ea + (eb - ea) * (m - a) / (b - a);
        }
        return 0;
    }

    // 들뜬 변: 놓일 때마다 한 변이 살짝 떠 있고, 그쪽으로 그림자가 넓게 진다. 각도처럼 k로 정해 온라인 양쪽이 같다.
    // 변 번호(딱지 기준 좌표의 바깥 방향): 0 = +u, 1 = -u, 2 = +v, 3 = -v
    // 딱지를 대각선으로 네 조각 냈을 때 들뜬 변 쪽 조각(바깥 포함)을 치면 그대로, 나머지 세 조각은 0.65배.
    const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const LIFTS = [0, 2, 1, 3, 2, 0, 3];
    const liftSide = (k) => LIFTS[((k % LIFTS.length) + LIFTS.length) % LIFTS.length];
    const OTHER_SIDE = 0.65;

    // 판 좌표 → 바닥 딱지 기준 좌표 (u, v)
    function local(k, x, y) {
        const t = tileAngle(k) * Math.PI / 180, dx = x - CENTER, dy = y - CENTER;
        return [dx * Math.cos(t) + dy * Math.sin(t), -dx * Math.sin(t) + dy * Math.cos(t)];
    }
    const sideOf = (u, v) => (Math.abs(u) >= Math.abs(v) ? (u >= 0 ? 0 : 1) : (v >= 0 ? 2 : 3));

    // 바닥 딱지 기준 거리 m (가운데 0, 가장자리 1)
    function edgeDistance(k, x, y) {
        const [u, v] = local(k, x, y);
        return Math.max(Math.abs(u), Math.abs(v)) / (TILE / 2);
    }

    function flipChance(k, x, y, power) {
        const p = Math.max(0, Math.min(1, power));
        const [u, v] = local(k, x, y);
        const m = Math.max(Math.abs(u), Math.abs(v)) / (TILE / 2);
        const side = sideOf(u, v) === liftSide(k) ? 1 : OTHER_SIDE;
        return Math.min(MAX_CHANCE, MAX_CHANCE * edgeScore(m) * side * Math.pow(p, 1.5));
    }

    const resolve = (k, x, y, power, roll) => roll < flipChance(k, x, y, power);

    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    const isValidShot = (x, y, power) =>
        num(x) && num(y) && num(power) && x >= 0 && x <= BOARD && y >= 0 && y <= BOARD && power >= 0 && power <= 1;

    // AI: 판정식은 사람과 같고 들뜬 변을 알아보는지와 조준·세기의 정확도로 난이도를 나눈다
    // (목표 성공률 쉬움 25% / 보통 50% / 어려움 75%).
    // 쉬움은 들뜬 변을 신경 쓰지 않고 딱지 위 아무 곳을, 보통은 절반쯤만 들뜬 변을, 어려움은 늘 들뜬 변의
    // 가장자리 바로 안쪽(0.92)을 노린다. see = 들뜬 변을 노리는 비율.
    const AIM = { normal: { sd: 0.2, pm: 0.86, ps: 0.1, see: 0.5 }, hard: { sd: 0.12, pm: 0.92, ps: 0.05, see: 1 } };
    const gauss = (rng) => {
        let u = 0, v = 0;
        while (!u) u = rng();
        while (!v) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function aiShot(level, k, rng = Math.random) {
        const h = TILE / 2;
        let u, v, power;
        if (!AIM[level]) {
            u = (rng() * 2 - 1) * h; v = (rng() * 2 - 1) * h;
            power = 0.42 + rng() * 0.5;
        } else {
            const c = AIM[level], d = h * 0.92, along = (rng() * 2 - 1) * h * 0.7;
            const [nu, nv] = SIDES[rng() < c.see ? liftSide(k) : Math.floor(rng() * 4)];
            u = nu * d - nv * along + gauss(rng) * c.sd * h;
            v = nv * d + nu * along + gauss(rng) * c.sd * h;
            power = clamp(c.pm + gauss(rng) * c.ps, 0, 1);
        }
        const t = tileAngle(k) * Math.PI / 180;
        return {
            x: clamp(CENTER + u * Math.cos(t) - v * Math.sin(t), 0, BOARD),
            y: clamp(CENTER + u * Math.sin(t) + v * Math.cos(t), 0, BOARD),
            power,
        };
    }

    return { BOARD, CENTER, TILE, MAX_CHANCE, OTHER_SIDE, tileAngle, liftSide, edgeDistance, flipChance, resolve, isValidShot, aiShot };
})();

// ─── 화면 ─────────────────────────────────────────────────────
// 좌석: 'black'(빨강)과 'white'(파랑). AI 대전은 사람이 black, 온라인은 서버가 준 좌석.
// 바닥에는 차례가 아닌 쪽(수비)의 딱지가 놓이고, 차례인 쪽이 내려친다.
// 뒤집으면 그 딱지를 따고 한 번 더, 못 뒤집으면 공수 교대. 어느 쪽이든 다음 딱지가 새로 놓인다(k+1).
class TtakjiGame {
    constructor() {
        this.$ = (id) => document.getElementById(id);
        this.canvas = this.$('tj-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.SCALE = this.canvas.width / TtakjiCore.BOARD;
        // 속성값은 한/영 span으로 나눌 수 없어 여기서 언어에 맞춰 넣는다 (영어판 HTML에 한글이 남지 않게)
        this.canvas.setAttribute('role', 'img');
        this.canvas.setAttribute('aria-label', this.tr('딱지치기 판', 'Ttakji board'));
        this.mode = null;          // 'ai' | 'pvp' | 'online'
        this.difficulty = 'normal';
        this.aiGames = 0;          // AI 대전 선공을 판마다 바꾸는 데 쓴다
        this.myColor = 'black';
        this.inputLocked = false;  // 온라인: 내 차례가 아니면 multiplayer.js가 잠근다
        this.hooks = {};           // 온라인: sendHit, afterMove, onlineCreate
        this.onGameOver = null;
        this.timers = [];
        this.raf = 0;
        this.idleWaiters = [];
        this.clear();
        this.bindEvents();
        this.draw();
        this.render();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }
    tr(ko, en) { return this.en ? en : ko; }
    other(c) { return c === 'black' ? 'white' : 'black'; }

    clear() {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.phase = 'idle';       // idle | aim | gauge | ai | wait | anim | over
        this.counts = { black: 5, white: 5 };
        this.k = 0;                // 지금까지 놓인 바닥 딱지 수 (각도 결정)
        this.currentTurn = 'black';
        this.aim = null;
        this.power = 0;
        this.gaugeDir = 1;
        this.aiGauge = null;
        this.anim = null;
        this.last = null;          // 마지막 결과 { by, flipped }
        this.stats = { black: { shots: 0, flips: 0 }, white: { shots: 0, flips: 0 } };
        this.winner = null;
        this.overShown = false;
        this.resolveIdle();
    }

    later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

    // ── 시작 ──
    showStep(id) {
        for (const s of ['tj-step-mode', 'tj-step-diff', 'tj-step-online', 'tj-step-online-join']) {
            const el = this.$(s);
            if (el) el.classList.toggle('hidden', s !== id);
        }
    }

    showModeScreen() {
        this.clear();
        this.mode = null;
        this.$('tj-win-overlay').classList.add('hidden');
        this.$('tj-mode-overlay').classList.remove('hidden');
        this.showStep('tj-step-mode');
        this.draw();
        this.render();
    }

    startGame(mode) {
        this.clear();
        this.mode = mode;
        this.$('tj-mode-overlay').classList.add('hidden');
        this.$('tj-win-overlay').classList.add('hidden');
        if (mode === 'ai') this.currentTurn = this.aiGames % 2 === 0 ? 'black' : 'white';
        this.beginTurn();
    }

    // multiplayer.js가 재대결·상대 나감 때 부른다
    resetGame() {
        this.clear();
        this.$('tj-win-overlay').classList.add('hidden');
        this.beginTurn();
    }

    // 사람이 이 화면에서 칠 차례인가
    isHuman(color) {
        if (this.mode === 'pvp') return true;
        if (this.mode === 'ai') return color === 'black';
        return color === this.myColor;
    }

    beginTurn() {
        this.aim = null;
        this.power = 0;
        if (this.phase === 'over') return;
        if (this.mode === 'ai' && this.currentTurn === 'white') this.aiTurn();
        else this.phase = 'aim';
        this.draw();
        this.render();
    }

    canAct() {
        if (this.phase !== 'aim' && this.phase !== 'gauge') return false;
        if (!this.isHuman(this.currentTurn)) return false;
        return this.mode !== 'online' || !this.inputLocked;
    }

    // ── 입력 ──
    setAim(x, y) {
        if (this.phase !== 'aim' || !this.canAct()) return;
        const B = TtakjiCore.BOARD;
        this.aim = { x: Math.max(0, Math.min(B, x)), y: Math.max(0, Math.min(B, y)) };
        this.draw();
        this.render();
    }

    // "치기" 버튼·스페이스: 한 번 누르면 게이지 시작, 다시 누르면 그 세기로 내리친다
    press() {
        if (!this.canAct() || !this.aim) return;
        if (this.phase === 'aim') {
            this.phase = 'gauge';
            this.power = 0;
            this.gaugeDir = 1;
            this.loop();
            this.render();
            return;
        }
        this.strike(this.aim.x, this.aim.y, this.power);
    }

    strike(x, y, power) {
        if (this.mode === 'online') {
            this.phase = 'wait';
            this.render();
            this.hooks.sendHit?.(x, y, power);
            return;
        }
        this.play({ by: this.currentTurn, x, y, power, roll: Math.random() });
    }

    // 게이지: 0→100% 왕복, 90% 넘으면 바늘이 빨라져 정확히 멈추기 어렵다
    stepGauge(dt) {
        const speed = this.power >= 0.9 ? 2.6 : 1.1; // 초당 이동량
        this.power += this.gaugeDir * speed * dt;
        if (this.power >= 1) { this.power = 1; this.gaugeDir = -1; }
        if (this.power <= 0) { this.power = 0; this.gaugeDir = 1; }
    }

    loop() {
        cancelAnimationFrame(this.raf);
        let prev = performance.now();
        const tick = (now) => {
            const dt = Math.min(0.05, (now - prev) / 1000);
            prev = now;
            if (this.phase === 'gauge') this.stepGauge(dt);
            this.draw(now);
            this.renderGauge();
            const moving = this.phase === 'gauge' || this.phase === 'anim' || this.phase === 'ai';
            this.raf = moving ? requestAnimationFrame(tick) : 0;
        };
        this.raf = requestAnimationFrame(tick);
    }

    // ── AI: 조준점과 게이지를 보여 준 뒤 1초 남짓 지나 친다 ──
    aiTurn() {
        this.phase = 'ai';
        const shot = TtakjiCore.aiShot(this.difficulty, this.k);
        this.later(() => {
            this.aim = { x: shot.x, y: shot.y };
            this.aiGauge = { from: performance.now(), to: shot.power };
            this.loop();
        }, 500);
        this.later(() => this.play({ by: 'white', ...shot, roll: Math.random() }), 1500);
    }

    // ── 내리치기와 결과 ──
    // 온라인에서는 서버가 보낸 hit 메시지로, 그 밖에는 strike()·aiTurn()이 부른다. 판정은 어디서나 이 식 하나.
    play(h) {
        if (this.phase === 'over') return;
        this.aim = { x: h.x, y: h.y };
        this.power = h.power;
        this.aiGauge = null;
        this.anim = { ...h, flipped: TtakjiCore.resolve(this.k, h.x, h.y, h.power, h.roll), t0: performance.now() };
        this.phase = 'anim';
        this.render();
        this.loop();
        this.later(() => this.settle(), this.anim.flipped ? 1300 : 900);
    }

    settle() {
        const { by, flipped } = this.anim;
        const def = this.other(by);
        this.stats[by].shots++;
        if (flipped) {
            this.stats[by].flips++;
            this.counts[def]--;
            this.counts[by]++;
        } else {
            this.currentTurn = def;
        }
        this.last = { by, flipped };
        this.anim = null;
        if (flipped && this.counts[def] === 0) {
            this.winner = by;
            this.phase = 'over';
        } else {
            this.k++;
            this.phase = 'idle';
        }
        // 온라인: 친 쪽이 확정 상태와 다음 차례를 보낸다 (받는 쪽도 같은 계산을 이미 끝냈다)
        if (this.mode === 'online' && by === this.myColor) {
            this.hooks.afterMove?.({ nextTurn: this.currentTurn, state: { counts: { ...this.counts }, k: this.k } });
        }
        this.resolveIdle();
        if (this.phase === 'over') this.finish();
        else this.beginTurn();
    }

    // 상대의 move가 내 화면의 연출보다 먼저 오면 연출이 끝난 뒤에 맞춘다
    whenIdle() {
        return this.phase === 'anim' ? new Promise((r) => this.idleWaiters.push(r)) : Promise.resolve();
    }

    resolveIdle() {
        const w = this.idleWaiters;
        this.idleWaiters = [];
        w.forEach((r) => r());
    }

    finish() {
        this.phase = 'over';
        this.draw();
        this.render();
        if (this.overShown) return;
        this.overShown = true;
        if (this.mode === 'ai') this.aiGames++;
        const w = this.winner;
        let title;
        if (this.mode === 'pvp') title = w === 'black' ? this.tr('빨강 승리!', 'Red Wins!') : this.tr('파랑 승리!', 'Blue Wins!');
        else title = this.isHuman(w) ? this.tr('승리!', 'You Win!') : this.tr('패배', 'You Lose');
        const line = (c) => {
            const s = this.stats[c], who = this.name(c);
            return this.tr(`${who} ${s.shots}번 쳐서 ${s.flips}번 뒤집기`, `${who}: ${s.flips} flips in ${s.shots} hits`);
        };
        this.$('tj-win-title').textContent = title;
        this.$('tj-win-desc').textContent = `${line('black')} · ${line('white')}`;
        setTimeout(() => this.$('tj-win-overlay').classList.remove('hidden'), 600);
        if (this.mode === 'online' && this.onGameOver) this.onGameOver();
    }

    // ── 온라인 ──
    setColor(color) {
        this.myColor = color;
        this.render();
    }

    // 서버 확정 상태로 맞춘다 (입장·재접속·거부·상대의 move). 진행 중인 연출은 끊는다.
    applyOnlineState(state) {
        if (!state || !state.counts) return;
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        this.anim = null;
        this.counts = { black: state.counts.black, white: state.counts.white };
        this.k = state.k;
        this.currentTurn = state.turn;
        this.resolveIdle();
        const loser = ['black', 'white'].find((c) => this.counts[c] <= 0);
        if (loser) {
            this.winner = this.other(loser);
            this.finish();
            return;
        }
        this.phase = 'idle';
        this.beginTurn();
    }

    // ── 그리기 ──
    name(color) {
        if (this.mode === 'ai') return color === 'black' ? this.tr('나', 'You') : 'AI';
        if (this.mode === 'online') return color === this.myColor ? this.tr('나', 'You') : this.tr('상대', 'Opponent');
        return color === 'black' ? this.tr('빨강', 'Red') : this.tr('파랑', 'Blue');
    }

    statusText() {
        const t = this.tr.bind(this);
        if (!this.mode) return '';
        if (this.phase === 'over') {
            if (this.mode === 'pvp') return this.winner === 'black' ? t('빨강 승리!', 'Red wins!') : t('파랑 승리!', 'Blue wins!');
            return this.isHuman(this.winner) ? t('승리! 상대 딱지를 모두 땄습니다', 'You win! You took every ttakji') : t('패배', 'You lose');
        }
        if (this.phase === 'anim') return t('내리친다!', 'Slam!');
        if (!this.isHuman(this.currentTurn)) {
            return this.mode === 'ai' ? t('AI가 겨누는 중…', 'AI is aiming…') : t('상대 차례', 'Opponent turn');
        }
        if (this.phase === 'wait') return t('내리치는 중…', 'Slamming…');
        const who = this.name(this.currentTurn);
        const head = this.mode === 'pvp' ? t(`${who} 차례 · `, `${who}'s turn · `) : t('내 차례 · ', 'Your turn · ');
        if (this.phase === 'gauge') return head + t('다시 눌러 세기를 정하세요', 'press again to set the power');
        if (!this.aim) return head + t('딱지 근처를 눌러 조준하세요', 'tap near the ttakji to aim');
        return head + t('치기(스페이스)로 게이지 시작', 'press Hit (Space) to start the gauge');
    }

    infoText() {
        if (!this.last || this.phase === 'over') return '';
        const who = this.name(this.last.by);
        if (this.last.flipped) return this.tr(`${who}: 뒤집었다! 딱지를 따고 한 번 더`, `${who}: flipped it! Takes the ttakji and goes again`);
        return this.tr(`${who}: 못 뒤집었다 · 공수 교대`, `${who}: no flip · turns switch`);
    }

    render() {
        this.$('tj-status').textContent = this.statusText();
        this.$('tj-info').textContent = this.infoText();
        for (const c of ['black', 'white']) {
            const el = this.$('tj-side-' + c);
            const n = Math.max(0, this.counts[c]);
            el.innerHTML = `<b>${this.name(c)}</b><span class="tj-chips">${'<i></i>'.repeat(n)}</span><span class="tj-num">${n}</span>`;
            el.classList.toggle('on', !!this.mode && this.phase !== 'over' && this.currentTurn === c);
        }
        const btn = this.$('tj-hit-btn');
        btn.disabled = !this.canAct() || !this.aim;
        btn.classList.toggle('armed', this.phase === 'gauge');
        this.canvas.style.cursor = this.canAct() && this.phase === 'aim' ? 'crosshair' : 'default';
        this.renderGauge();
    }

    renderGauge() {
        let p = this.power;
        if (this.phase === 'ai') {
            const g = this.aiGauge;
            p = g ? g.to * (1 - (1 - Math.min(1, (performance.now() - g.from) / 700)) ** 2) : 0;
        } else if (this.phase !== 'gauge' && this.phase !== 'anim' && this.phase !== 'wait') p = 0;
        this.$('tj-gauge-fill').style.width = (p * 100).toFixed(1) + '%';
    }

    // 딱지 한 장: 앞면은 네 귀를 접어 넣은 무늬, 뒷면은 접힌 자국만 있는 평평한 면
    drawTile(cx, cy, size, angle, color, back, sx = 1) {
        const c = this.ctx, h = size / 2;
        const [fill, dark] = color === 'black' ? ['#d64541', '#8f2523'] : ['#3b7dd8', '#1f4f92'];
        c.save();
        c.translate(cx, cy);
        c.rotate(angle * Math.PI / 180);
        c.scale(sx, 1);
        c.fillStyle = back ? '#e9d9b8' : fill;
        c.strokeStyle = back ? '#b49a6e' : dark;
        c.lineWidth = 2;
        c.fillRect(-h, -h, size, size);
        c.strokeRect(-h, -h, size, size);
        c.beginPath();
        if (back) {
            c.moveTo(-h, -h); c.lineTo(h, h); c.moveTo(h, -h); c.lineTo(-h, h);
        } else {
            c.moveTo(0, -h); c.lineTo(h, 0); c.lineTo(0, h); c.lineTo(-h, 0); c.closePath();
            c.moveTo(-h, -h); c.lineTo(h, h); c.moveTo(h, -h); c.lineTo(-h, h);
        }
        c.stroke();
        c.restore();
    }

    draw(now = performance.now()) {
        const c = this.ctx, B = TtakjiCore.BOARD, C = TtakjiCore.CENTER, S = TtakjiCore.TILE;
        c.setTransform(this.SCALE, 0, 0, this.SCALE, 0, 0);
        const g = c.createRadialGradient(C, C, 40, C, C, B * 0.75);
        g.addColorStop(0, '#5a4733');
        g.addColorStop(1, '#2e241b');
        c.fillStyle = g;
        c.fillRect(0, 0, B, B);
        if (!this.mode) return;

        const angle = TtakjiCore.tileAngle(this.k);
        const a = this.anim, t = a ? (now - a.t0) / 1000 : 0;
        const def = a ? this.other(a.by) : this.phase === 'over' ? this.other(this.winner) : this.other(this.currentTurn);
        const DROP = 0.3;

        // 바닥 딱지(수비 쪽). 뒤집히면 들렸다가 뒷면으로 떨어지고, 아니면 살짝 흔들린다
        let lift = 0, sx = 1, back = this.phase === 'over', shake = 0;
        if (a && t > DROP) {
            const u = Math.min(1, (t - DROP) / 0.6);
            if (a.flipped) {
                lift = Math.sin(Math.PI * u);
                const cos = Math.cos(Math.PI * u);
                back = cos < 0;
                sx = Math.max(0.02, Math.abs(cos));
            } else shake = Math.sin(u * Math.PI * 6) * (1 - u) * 3;
        }
        // 그림자: 바닥에 붙은 쪽은 얇게, 들뜬 변 쪽으로는 넓고 진하게 진다 (들뜬 변을 알아보는 단서)
        // toLift: 딱지 기준 좌표에서 +u(변 0)를 들뜬 변 방향으로 돌리는 각도
        const toLift = [0, Math.PI, Math.PI / 2, -Math.PI / 2][TtakjiCore.liftSide(this.k)];
        c.save();
        c.translate(C, C);
        c.rotate(angle * Math.PI / 180);
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(-S / 2 + 3, -S / 2 + 4, S, S);
        c.rotate(toLift);
        const sg = c.createLinearGradient(S / 2, 0, S / 2 + 18, 0);
        sg.addColorStop(0, 'rgba(0,0,0,0.6)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sg;
        c.fillRect(S / 2 - 2, -S / 2 + 3, 20, S - 6);
        c.restore();
        this.drawTile(C + shake, C - lift * 40, S * (1 + lift * 0.2), angle + shake * 2, def, back, sx);

        const tileFrame = () => { c.translate(C, C); c.rotate(angle * Math.PI / 180); c.rotate(toLift); };
        if (!a && this.phase !== 'over') {
            // 들뜬 변은 빛을 받아 테두리가 살짝 밝다
            c.save();
            tileFrame();
            c.strokeStyle = 'rgba(255,255,255,0.45)';
            c.lineWidth = 2;
            c.beginPath(); c.moveTo(S / 2 - 1.5, -S / 2 + 2); c.lineTo(S / 2 - 1.5, S / 2 - 2); c.stroke();
            c.restore();
        }

        // 잘 뒤집히는 가장자리 점선 (쉬움 AI 대전에서만). 들뜬 변 쪽 띠는 노란색으로 더 굵게
        if (this.mode === 'ai' && this.difficulty === 'easy' && !a && this.phase !== 'over') {
            const inner = S * 0.85;
            c.save();
            tileFrame();
            c.setLineDash([6, 5]);
            c.lineWidth = 2;
            c.strokeStyle = 'rgba(255,255,255,0.5)';
            c.strokeRect(-inner / 2, -inner / 2, inner, inner);
            c.lineWidth = 3;
            c.strokeStyle = '#ffd27a';
            c.beginPath(); c.moveTo(inner / 2, -inner / 2); c.lineTo(inner / 2, inner / 2); c.stroke();
            c.restore();
        }

        // 조준점
        if (this.aim && !a) {
            const { x, y } = this.aim;
            c.save();
            c.strokeStyle = '#fff';
            c.lineWidth = 2;
            c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.stroke();
            c.beginPath();
            c.moveTo(x - 17, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 17, y);
            c.moveTo(x, y - 17); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 17);
            c.stroke();
            c.restore();
        }

        // 내리치는 딱지(공격 쪽): 위에서 떨어져 조준점에 닿는다
        if (a) {
            const u = Math.min(1, t / DROP);
            const fade = a.flipped ? Math.max(0, 1 - Math.max(0, t - 1.0) / 0.3) : 1;
            c.save();
            c.globalAlpha = (0.35 + 0.65 * u) * fade;
            this.drawTile(a.x, a.y - (1 - u) * 60, S * 0.8 * (1.8 - 0.8 * u), angle + 25, a.by, false);
            c.restore();
            if (t > DROP && t < DROP + 0.25) { // 부딪힌 자리 먼지
                const r = (t - DROP) / 0.25;
                c.strokeStyle = `rgba(255,240,210,${0.6 * (1 - r)})`;
                c.lineWidth = 3;
                c.beginPath(); c.arc(a.x, a.y, 20 + r * 60 * (0.4 + a.power), 0, Math.PI * 2); c.stroke();
            }
        }
    }

    // ── 이벤트 ──
    bindEvents() {
        const on = (id, fn) => { const el = this.$(id); if (el) el.addEventListener('click', fn); };
        on('tj-ai-btn', () => this.showStep('tj-step-diff'));
        on('tj-pvp-btn', () => this.startGame('pvp'));
        on('tj-online-btn', () => this.showStep('tj-step-online'));
        on('online-create-btn', () => this.hooks.onlineCreate?.());
        for (const d of ['easy', 'normal', 'hard']) on(`tj-${d}-btn`, () => { this.difficulty = d; this.startGame('ai'); });
        on('tj-diff-back', () => this.showStep('tj-step-mode'));
        on('tj-hit-btn', () => this.press());
        // 재시작·다시 하기: 다른 게임과 같이 모드 선택 화면으로
        on('tj-reset-btn', () => this.showModeScreen());
        on('tj-modal-reset', () => this.showModeScreen());

        this.canvas.addEventListener('pointerdown', (e) => {
            const r = this.canvas.getBoundingClientRect();
            const B = TtakjiCore.BOARD;
            this.setAim((e.clientX - r.left) * B / r.width, (e.clientY - r.top) * B / r.height);
        });

        document.addEventListener('keydown', (e) => {
            if (e.code !== 'Space') return;
            if (!this.$('tj-mode-overlay').classList.contains('hidden') || document.querySelector('.overlay:not(.hidden)')) return;
            // 버튼에 초점이 있으면 스페이스가 그 버튼을 누르므로 여기서는 넘긴다
            if (e.target.closest?.('input, textarea, button, a')) return;
            e.preventDefault(); // 화면이 내려가지 않게
            this.press();
        });
    }

    refreshLang() { this.render(); }
}

window.ttakjiGame = new TtakjiGame();
