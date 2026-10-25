// 숫자야구: 규칙·AI(BaseballCore, DOM 없음)와 화면(BaseballGame).
// 규칙: 1~9 중 서로 다른 숫자로 3자리(또는 4자리). 자리까지 맞으면 스트라이크, 숫자만 맞으면 볼.
// 서버 판정(worker/baseball.mjs)과 규칙이 같아야 한다 — scripts/baseball-ai-check.mjs가 대조한다.
const BaseballCore = (() => {
    const cache = {};
    function allCodes(n) {
        if (cache[n]) return cache[n];
        const out = [];
        const rec = (s) => {
            if (s.length === n) { out.push(s); return; }
            for (let d = 1; d <= 9; d++) if (!s.includes(String(d))) rec(s + d);
        };
        rec('');
        return (cache[n] = out);
    }

    const isValid = (s, n) => typeof s === 'string' && s.length === n && /^[1-9]+$/.test(s) && new Set(s).size === n;

    function score(secret, guess) {
        let strikes = 0, balls = 0;
        for (let i = 0; i < guess.length; i++) {
            if (secret[i] === guess[i]) strikes++;
            else if (secret.includes(guess[i])) balls++;
        }
        return { strikes, balls };
    }

    const key = (r) => r.strikes * 10 + r.balls;
    const pick = (a, rng) => a[Math.floor(rng() * a.length)];
    const randomCode = (n, rng = Math.random) => pick(allCodes(n), rng);

    // 지금까지의 판정(history: [{guess, strikes, balls}])에 모두 맞는 후보
    function candidates(n, history) {
        let c = allCodes(n);
        for (const h of history) { const k = key(h); c = c.filter((x) => key(score(x, h.guess)) === k); }
        return c;
    }

    // AI가 부를 숫자. 쉬움·보통은 최근 판정 몇 개만 기억하는 사람처럼 둔다(쉬움 2개, 보통 3개):
    // 전부 기억하고 후보 중 아무거나 부르기만 해도 최선에 거의 가까워서, 기억 개수로 실력 차를 만든다.
    // 어려움: 모든 판정을 쓰고, 부른 뒤 남는 후보 수의 기댓값이 가장 작은 숫자. 첫 수는 어느 숫자든 같으니 무작위.
    const MEMORY = { easy: 2, normal: 3 };
    function aiGuess(level, n, history, rng = Math.random) {
        const tried = new Set(history.map((h) => h.guess));
        const fresh = (a) => a.filter((x) => !tried.has(x));
        if (MEMORY[level]) {
            const pool = fresh(candidates(n, history.slice(-MEMORY[level])));
            return pick(pool.length ? pool : fresh(allCodes(n)), rng);
        }
        const cands = candidates(n, history);
        if (history.length === 0 || cands.length <= 2) return pick(cands, rng);
        // ponytail: 후보가 많으면(4자리 초반) 후보 안에서만 고른다 — 전체 3,024개를 다 따지면 휴대폰에서 느리다.
        const pool = fresh(cands.length > 400 ? cands : allCodes(n));
        const isCand = new Set(cands);
        let best = [], bestScore = Infinity;
        for (const g of pool) {
            const counts = new Map();
            for (const c of cands) { const k = key(score(c, g)); counts.set(k, (counts.get(k) || 0) + 1); }
            let sum = 0;
            for (const v of counts.values()) sum += v * v;
            const s = sum - (isCand.has(g) ? 0.5 : 0); // 같으면 바로 맞힐 수도 있는 후보 쪽
            if (s < bestScore) { bestScore = s; best = [g]; } else if (s === bestScore) best.push(g);
        }
        return pick(best, rng);
    }

    return { allCodes, isValid, score, candidates, aiGuess, randomCode };
})();

// ─── 화면 ─────────────────────────────────────────────────────
// side: 'me' | 'opp'. 온라인에서는 서버 좌석(black/white)을 내 기준 side로 바꿔 쓴다.
class BaseballGame {
    constructor() {
        this.$ = (id) => document.getElementById(id);
        this.mode = null;          // 'solo' | 'ai' | 'online'
        this.pendingMode = null;
        this.digits = 3;
        this.difficulty = 'normal';
        this.aiGames = 0;          // AI 대결 선공을 판마다 바꾸는 데 쓴다
        this.myColor = 'black';    // 온라인 좌석
        this.currentTurn = null;   // 온라인 좌석 기준 차례 (multiplayer.js가 입력 잠금 계산에 씀)
        this.inputLocked = false;
        this.hooks = {};           // 온라인: sendSecret, sendGuess, onlineCreate
        this.lastState = null;
        this.clear();
        this.buildPad();
        this.bindEvents();
        this.render();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }
    tr(ko, en) { return this.en ? en : ko; }

    clear() {
        this.phase = 'idle';       // idle | setup | playing | final | over
        this.input = '';
        this.history = [];         // [{ side, guess, strikes, balls }]
        this.mySecret = null;
        this.oppSecret = null;     // 혼자: 컴퓨터 숫자 / AI 대결: AI 숫자 / 온라인: 끝나면 공개
        this.pendingSecret = null;
        this.first = 'me';
        this.turn = 'me';
        this.result = null;        // 'me' | 'opp' | 'draw'
        this.overShown = false;
        if (this.aiTimer) clearTimeout(this.aiTimer);
        this.aiTimer = null;
    }

    // ── 시작 ──
    showStep(id) {
        for (const s of ['bb-step-mode', 'bb-step-online', 'bb-step-online-join', 'bb-step-digits', 'bb-step-diff']) {
            const el = this.$(s);
            if (el) el.classList.toggle('hidden', s !== id);
        }
    }

    showModeScreen() {
        this.clear(); // 진행 중이던 AI 차례 타이머도 멈춘다
        this.mode = null;
        this.pendingMode = null;
        this.$('bb-win-overlay').classList.add('hidden');
        this.$('bb-mode-overlay').classList.remove('hidden');
        this.showStep('bb-step-mode');
        this.render();
    }

    startGame(mode) {
        this.clear();
        this.mode = mode;
        this.$('bb-mode-overlay').classList.add('hidden');
        this.$('bb-win-overlay').classList.add('hidden');
        if (mode === 'solo') {
            this.oppSecret = BaseballCore.randomCode(this.digits);
            this.phase = 'playing';
        } else if (mode === 'ai') {
            this.oppSecret = BaseballCore.randomCode(this.digits);
            this.first = this.aiGames % 2 === 0 ? 'me' : 'opp';
            this.phase = 'setup';
        } else {
            this.phase = 'setup'; // 온라인: 서버 상태가 오면 applyOnlineState가 덮어쓴다
        }
        this.render();
    }

    // multiplayer.js가 재대결·상대 나감 때 부른다. 자릿수는 유지한다.
    resetGame() {
        const digits = this.digits;
        this.clear();
        this.digits = digits;
        this.lastState = null;
        if (this.mode === 'online') { this.phase = 'setup'; this.first = this.side('black'); }
        this.$('bb-win-overlay').classList.add('hidden');
        this.render();
    }

    // ── 입력 ──
    canInput() {
        if (this.phase === 'setup') {
            if (this.mode === 'ai') return !this.mySecret;
            if (this.mode === 'online') return !this.mySecret && !this.pendingSecret;
            return false;
        }
        if (this.phase !== 'playing' && this.phase !== 'final') return false;
        if (this.turn !== 'me') return false;
        return this.mode !== 'online' || !this.inputLocked;
    }

    press(d) {
        if (!this.canInput() || this.input.length >= this.digits || this.input.includes(d)) return;
        this.input += d;
        this.render();
    }

    erase() {
        if (!this.input) return;
        this.input = this.input.slice(0, -1);
        this.render();
    }

    confirm() {
        if (!this.canInput() || !BaseballCore.isValid(this.input, this.digits)) return;
        const n = this.input;
        this.input = '';
        if (this.phase === 'setup') {
            if (this.mode === 'online') { this.pendingSecret = n; this.hooks.sendSecret?.(n); this.render(); return; }
            this.mySecret = n;
            this.phase = 'playing';
            this.turn = this.first;
            this.render();
            if (this.turn === 'opp') this.aiTurn();
            return;
        }
        if (this.mode === 'online') { this.inputLocked = true; this.hooks.sendGuess?.(n); this.render(); return; }
        const res = BaseballCore.score(this.oppSecret, n);
        this.history.push({ side: 'me', guess: n, ...res });
        const hit = res.strikes === this.digits;
        if (this.mode === 'solo') {
            if (hit) this.finish('me'); else this.render();
            return;
        }
        this.advance('me', hit);
    }

    // AI 대결의 차례·승패 진행 (서버 baseball.mjs의 applyGuess와 같은 규칙)
    advance(side, hit) {
        const other = side === 'me' ? 'opp' : 'me';
        if (this.phase === 'final') { this.finish(hit ? 'draw' : this.first); return; }
        if (hit && side === this.first) { this.phase = 'final'; this.turn = other; }
        else if (hit) { this.finish(side); return; }
        else this.turn = other;
        this.render();
        if (this.turn === 'opp') this.aiTurn();
    }

    aiTurn() {
        this.aiTimer = setTimeout(() => {
            this.aiTimer = null;
            if (this.mode !== 'ai' || this.turn !== 'opp') return;
            const past = this.history.filter((h) => h.side === 'opp');
            const g = BaseballCore.aiGuess(this.difficulty, this.digits, past);
            const res = BaseballCore.score(this.mySecret, g);
            this.history.push({ side: 'opp', guess: g, ...res });
            this.advance('opp', res.strikes === this.digits);
        }, 800);
    }

    finish(result) {
        this.phase = 'over';
        this.result = result;
        this.render();
        if (this.overShown) return;
        this.overShown = true;
        if (this.mode === 'ai') this.aiGames++;
        const mine = this.history.filter((h) => h.side === 'me').length;
        let title, desc;
        if (this.mode === 'solo') {
            const best = this.saveBest(mine);
            title = this.tr('정답!', 'Got it!');
            desc = this.tr(`${mine}번 만에 맞혔습니다.`, `Solved in ${mine} ${mine === 1 ? 'guess' : 'guesses'}.`) +
                (best ? this.tr(' 최고 기록입니다!', ' New best!') : '');
        } else {
            title = result === 'draw' ? this.tr('무승부', 'Draw') : result === 'me' ? this.tr('승리!', 'You Win!') : this.tr('패배', 'You Lose');
            desc = this.tr(`내 숫자 ${this.mySecret} · 상대 숫자 ${this.oppSecret || '?'} · 내 시도 ${mine}번`,
                `Your number ${this.mySecret} · Opponent ${this.oppSecret || '?'} · ${mine} guesses`);
        }
        this.$('bb-win-title').textContent = title;
        this.$('bb-win-desc').textContent = desc;
        setTimeout(() => this.$('bb-win-overlay').classList.remove('hidden'), 500);
        if (this.mode === 'online' && this.onGameOver) this.onGameOver();
    }

    // 최고 기록(자릿수별, 이 브라우저에만). 저장소를 못 쓰면 조용히 넘어간다.
    bestKey() { return 'omokboard.baseball.best' + this.digits; }
    getBest() { try { return Number(localStorage.getItem(this.bestKey())) || 0; } catch { return 0; } }
    saveBest(n) {
        const old = this.getBest();
        if (old && old <= n) return false;
        try { localStorage.setItem(this.bestKey(), String(n)); } catch { /* 저장 불가 */ }
        return true;
    }

    // ── 온라인 ──
    side(color) { return color === this.myColor ? 'me' : 'opp'; }

    setColor(color) {
        this.myColor = color;
        if (this.lastState) this.applyOnlineState(this.lastState);
    }

    // 서버 공개 상태 + (재접속 시) 내 숫자 + (끝나면) 양쪽 숫자
    applyOnlineState(state) {
        if (!state) return;
        this.lastState = state;
        this.digits = state.digits;
        this.phase = state.phase;
        this.first = this.side(state.first);
        this.history = (state.history || []).map((h) => ({ side: this.side(h.color), guess: h.guess, strikes: h.strikes, balls: h.balls }));
        this.currentTurn = state.turn;
        this.turn = this.side(state.turn);
        if (state.secret) this.mySecret = state.secret;
        if (!this.mySecret && this.pendingSecret && state.ready && state.ready[this.myColor]) this.mySecret = this.pendingSecret;
        if (state.reveal) this.oppSecret = state.reveal[this.myColor === 'black' ? 'white' : 'black'];
        if (state.phase === 'over') this.finish(state.result === 'draw' ? 'draw' : this.side(state.result));
        else this.render();
    }

    // ── 그리기 ──
    buildPad() {
        const pad = this.$('bb-pad');
        for (let d = 1; d <= 9; d++) {
            const b = document.createElement('button');
            b.className = 'bb-key';
            b.textContent = d;
            b.dataset.d = d;
            b.addEventListener('click', () => this.press(String(d)));
            pad.appendChild(b);
        }
        const del = document.createElement('button');
        del.className = 'bb-key bb-del';
        del.textContent = '⌫';
        del.setAttribute('aria-label', 'erase');
        del.addEventListener('click', () => this.erase());
        pad.appendChild(del);
    }

    badge(h) {
        if (h.strikes === this.digits) return `<span class="bb-badge bb-hit">${this.tr('정답', 'HIT')}</span>`;
        if (!h.strikes && !h.balls) return `<span class="bb-badge bb-out">${this.tr('아웃', 'OUT')}</span>`;
        return (h.strikes ? `<span class="bb-badge bb-s">${h.strikes}S</span>` : '') + (h.balls ? `<span class="bb-badge bb-b">${h.balls}B</span>` : '');
    }

    statusText() {
        const t = this.tr.bind(this);
        if (this.phase === 'idle') return '';
        if (this.phase === 'over') {
            if (this.mode === 'solo') return t('정답입니다!', 'Correct!');
            return this.result === 'draw' ? t('무승부', 'Draw') : this.result === 'me' ? t('승리!', 'You win!') : t('패배', 'You lose');
        }
        if (this.mode === 'solo') return t(`숨겨진 ${this.digits}자리 숫자를 맞혀 보세요`, `Guess the hidden ${this.digits}-digit number`);
        if (this.phase === 'setup') {
            if (this.mySecret || this.pendingSecret) return t('상대가 숫자를 정하는 중…', 'Waiting for your opponent to pick…');
            return t('내 숫자를 정하세요 (상대는 볼 수 없어요)', 'Pick your secret number (hidden from your opponent)');
        }
        const final = this.phase === 'final';
        if (this.turn === 'me') return final ? t('마지막 기회! 맞히면 무승부', 'Last chance! Hit it to draw') : t('내 차례 · 상대 숫자를 맞혀 보세요', 'Your turn · guess their number');
        if (this.mode === 'ai') return final ? t('AI의 마지막 기회…', 'Last chance for the AI…') : t('AI가 생각하는 중…', 'AI is thinking…');
        return final ? t('상대의 마지막 기회…', 'Last chance for your opponent…') : t('상대 차례', 'Opponent turn');
    }

    render() {
        const duel = this.mode === 'ai' || this.mode === 'online';
        this.$('bb-status').textContent = this.statusText();
        const mine = this.history.filter((h) => h.side === 'me').length;
        let info = '';
        if (this.mode === 'solo') {
            const best = this.getBest();
            info = this.tr(`시도 ${mine}번`, `${mine} ${mine === 1 ? 'guess' : 'guesses'}`) + (best ? this.tr(` · 최고 기록 ${best}번`, ` · Best ${best}`) : '');
        } else if (duel && this.mySecret) {
            info = this.tr(`내 숫자 ${this.mySecret}`, `Your number ${this.mySecret}`);
        }
        this.$('bb-info').textContent = info;

        const slots = this.$('bb-slots');
        if (slots.children.length !== this.digits) {
            slots.innerHTML = '';
            for (let i = 0; i < this.digits; i++) slots.appendChild(Object.assign(document.createElement('div'), { className: 'bb-slot' }));
        }
        const can = this.canInput();
        [...slots.children].forEach((el, i) => {
            el.textContent = this.input[i] || '';
            el.classList.toggle('on', can && i === this.input.length);
        });
        for (const b of this.$('bb-pad').children) {
            b.disabled = !can || (b.dataset.d ? this.input.includes(b.dataset.d) || this.input.length >= this.digits : !this.input);
        }
        this.$('bb-ok').disabled = !can || this.input.length !== this.digits;

        const row = (h) => `<li><b>${h.guess}</b><span>${this.badge(h)}</span></li>`;
        this.$('bb-hist-me').innerHTML = this.history.filter((h) => h.side === 'me').map(row).join('');
        this.$('bb-hist-opp').innerHTML = this.history.filter((h) => h.side === 'opp').map(row).join('');
        this.$('bb-hist').classList.toggle('duel', duel);
    }

    bindEvents() {
        const on = (id, fn) => { const el = this.$(id); if (el) el.addEventListener('click', fn); };
        on('bb-solo-btn', () => { this.pendingMode = 'solo'; this.showStep('bb-step-digits'); });
        on('bb-ai-btn', () => { this.pendingMode = 'ai'; this.showStep('bb-step-digits'); });
        on('bb-online-btn', () => this.showStep('bb-step-online'));
        on('online-create-btn', () => { this.pendingMode = 'online'; this.showStep('bb-step-digits'); });
        for (const n of [3, 4]) {
            on(`bb-d${n}-btn`, () => {
                this.digits = n;
                if (this.pendingMode === 'ai') this.showStep('bb-step-diff');
                else if (this.pendingMode === 'online') this.hooks.onlineCreate?.(n);
                else this.startGame('solo');
            });
        }
        for (const d of ['easy', 'normal', 'hard']) on(`bb-${d}-btn`, () => { this.difficulty = d; this.startGame('ai'); });
        on('bb-digits-back', () => this.showStep(this.pendingMode === 'online' ? 'bb-step-online' : 'bb-step-mode'));
        on('bb-diff-back', () => this.showStep('bb-step-digits'));
        on('bb-ok', () => this.confirm());
        // 재시작·다시 하기: 다른 게임과 같이 모드 선택 화면(게임 유형 → 자릿수 → 난이도)으로 돌아간다
        on('bb-reset-btn', () => this.showModeScreen());
        on('bb-modal-reset', () => this.showModeScreen());

        document.addEventListener('keydown', (e) => {
            // 모드 선택·온라인 대기·결과 창이 떠 있으면 키보드로 숫자를 보내지 않는다
            if (!this.$('bb-mode-overlay').classList.contains('hidden') || document.querySelector('.overlay:not(.hidden)')) return;
            if (e.target.closest?.('input, textarea')) return;
            if (/^[1-9]$/.test(e.key)) this.press(e.key);
            else if (e.key === 'Backspace') { this.erase(); e.preventDefault(); }
            else if (e.key === 'Enter') this.confirm();
        });
    }

    refreshLang() { this.render(); }
}

window.baseballGame = new BaseballGame();
