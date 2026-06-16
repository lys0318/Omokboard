// 윷놀이 (Yut Nori) — 표준 윷판(외곽 + 대각선 지름길) · PvP + AI
// 노드: 0~19 외곽, 20~24 대각선/중앙, FINISH=99, WAIT=-1
const YUT_FINISH = 99, YUT_WAIT = -1;

class YutGame {
    constructor() {
        this.coords = {
            0:[5,5],1:[5,4],2:[5,3],3:[5,2],4:[5,1],5:[5,0],
            6:[4,0],7:[3,0],8:[2,0],9:[1,0],10:[0,0],
            11:[0,1],12:[0,2],13:[0,3],14:[0,4],15:[0,5],
            16:[1,5],17:[2,5],18:[3,5],19:[4,5],
            20:[3.75,1.25],21:[1.25,1.25],22:[2.5,2.5],23:[3.75,3.75],24:[1.25,3.75]
        };
        this.bigNodes = [0,5,10,15,22];

        this.players = {
            p1: { color:'red',  tokens:[YUT_WAIT,YUT_WAIT,YUT_WAIT,YUT_WAIT], done:0 },
            p2: { color:'blue', tokens:[YUT_WAIT,YUT_WAIT,YUT_WAIT,YUT_WAIT], done:0 }
        };
        this.current = 'p1';
        this.gameMode = 'pvp';
        this.vsAI = false;
        this.difficulty = 'normal';
        this.results = [];          // [{v,name}]
        this.canThrow = true;
        this.phase = 'throw';       // 'throw' | 'selectToken' | 'selectDest'
        this.selectedToken = null;
        this.destOptions = [];      // [{v,name,dest,x,y}]
        this.isGameOver = false;
        this.busy = false;
        this.glow = 0;
        this._glowRAF = null;

        this.canvas = document.getElementById('yut-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.statusEl = document.getElementById('yut-status');
        this.throwBtn = document.getElementById('yut-throw-btn');
        this.resultsEl = document.getElementById('yut-results');
        this.throwResultEl = document.getElementById('yut-throw-result');
        this.modeOverlay = document.getElementById('yut-mode-overlay');
        this.winOverlay = document.getElementById('yut-win-overlay');
        this.winTitle = document.getElementById('yut-win-title');
        this.winDesc = document.getElementById('yut-win-desc');
        this.p1infoEl = document.getElementById('yut-p1-info');
        this.p2infoEl = document.getElementById('yut-p2-info');

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 460);
        this.W = maxW; this.H = maxW;
        this.canvas.width = this.W; this.canvas.height = this.H;
        this.margin = this.W * 0.1;
        this.draw();
    }

    nodePos(id) {
        const [gx, gy] = this.coords[id];
        const span = this.W - this.margin * 2;
        return { x: this.margin + gx/5*span, y: this.margin + gy/5*span };
    }
    finishPos() { const p = this.nodePos(0); return { x: p.x, y: p.y + this.W*0.075 }; }

    bindEvents() {
        this.throwBtn.addEventListener('click', () => this.onThrow());
        this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
        document.getElementById('yut-pvp-btn').addEventListener('click', () => this.startGame('pvp', false));
        document.getElementById('yut-ai-select-btn').addEventListener('click', () => {
            document.getElementById('yut-step-mode').classList.add('hidden');
            document.getElementById('yut-step-diff').classList.remove('hidden');
        });
        document.getElementById('yut-easy-btn').addEventListener('click',   () => this.startGame('ai','easy'));
        document.getElementById('yut-normal-btn').addEventListener('click', () => this.startGame('ai','normal'));
        document.getElementById('yut-hard-btn').addEventListener('click',   () => this.startGame('ai','hard'));
        document.getElementById('yut-diff-back').addEventListener('click', () => { window.location.href='index.html'; });
        document.getElementById('yut-reset-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('yut-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden'); this.showModeScreen();
        });
    }

    showModeScreen() {
        this.stopGlow();
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('yut-step-mode').classList.remove('hidden');
        document.getElementById('yut-step-diff').classList.add('hidden');
    }

    startGame(mode, diff) {
        this.gameMode = mode === 'ai' ? 'ai' : 'pvp';
        this.vsAI = mode === 'ai';
        this.difficulty = diff || 'normal';
        this.modeOverlay.classList.add('hidden');
        this.reset();
    }

    reset() {
        this.players.p1 = { color:'red',  tokens:[YUT_WAIT,YUT_WAIT,YUT_WAIT,YUT_WAIT], done:0 };
        this.players.p2 = { color:'blue', tokens:[YUT_WAIT,YUT_WAIT,YUT_WAIT,YUT_WAIT], done:0 };
        this.current = 'p1';
        this.results = [];
        this.canThrow = true;
        this.phase = 'throw';
        this.selectedToken = null;
        this.destOptions = [];
        this.isGameOver = false;
        this.busy = false;
        this.throwResultEl.textContent = '';
        this.stopGlow();
        this.renderResults();
        this.draw();
        this.updateStatus();
        this.updateThrowBtn();
    }

    // ─── 윷 던지기 ────────────────────────────────────────────
    rollYut() {
        let flats = 0;
        for (let i = 0; i < 4; i++) if (Math.random() < 0.5) flats++;
        const map = { 1:{v:1,name:'도'}, 2:{v:2,name:'개'}, 3:{v:3,name:'걸'}, 4:{v:4,name:'윷'}, 0:{v:5,name:'모'} };
        return map[flats];
    }

    onThrow() {
        if (this.isGameOver || this.busy || !this.canThrow) return;
        if (this.gameMode === 'ai' && this.current === 'p2') return;
        this.doThrow();
    }

    doThrow() {
        const r = this.rollYut();
        this.results.push(r);
        const bonus = (r.name === '윷' || r.name === '모');
        this.canThrow = bonus;
        this.throwResultEl.textContent = (this.en ? this.engName(r.name) : r.name) + ' (' + r.v + ')' + (bonus ? (this.en ? ' — throw again!' : ' — 한 번 더!') : '');
        this.renderResults();
        if (!this.hasAnyMove()) {
            // 움직일 말이 전혀 없음
            if (!this.canThrow) { this.setStatusNoMove(); setTimeout(() => this.endTurn(), 900); }
            else { this.updateStatus(); }
            this.updateThrowBtn();
            return;
        }
        this.phase = 'selectToken';
        this.selectedToken = null;
        this.destOptions = [];
        this.updateGlow();
        this.updateStatus();
        this.updateThrowBtn();
    }

    engName(n){ return ({'도':'Do','개':'Gae','걸':'Geol','윷':'Yut','모':'Mo'})[n]; }

    hasAnyMove() {
        if (!this.results.length) return false;
        return this.players[this.current].tokens.some(t => t !== YUT_FINISH);
    }
    setStatusNoMove() { this.statusEl.textContent = this.en ? 'No moves — turn passes' : '움직일 말이 없어 턴 넘김'; }

    // ─── 이동 경로 ────────────────────────────────────────────
    nextNode(pos, prev, firstStep) {
        if (firstStep && pos === 5)  return { pos: 20, prev: 5 };
        if (firstStep && pos === 10) return { pos: 21, prev: 10 };
        if (firstStep && pos === 22) return { pos: 23, prev: 22 };
        if (pos === 20) return { pos: 22, prev: 20 };
        if (pos === 21) return { pos: 22, prev: 21 };
        if (pos === 22) return (prev === 20) ? { pos: 24, prev: 22 } : { pos: 23, prev: 22 };
        if (pos === 24) return { pos: 15, prev: 24 };
        if (pos === 23) return { pos: YUT_FINISH, prev: 23 };
        if (pos === 19) return { pos: YUT_FINISH, prev: 19 };
        return { pos: pos + 1, prev: pos };
    }

    // start 노드에서 steps 칸 이동. 도=1..모=5 만큼 정확히 전진.
    travel(startPos, steps) {
        // 대기 말은 출발점(노드0)에서 시작해 steps칸 전진 → 도:1, 개:2, 걸:3, 윷:4, 모:5
        let pos, prev, first;
        if (startPos === YUT_WAIT) { pos = 0; prev = YUT_WAIT; first = false; }
        else { pos = startPos; prev = -2; first = true; }
        for (let s = 0; s < steps; s++) {
            const nx = this.nextNode(pos, prev, first && s === 0 && startPos !== YUT_WAIT);
            pos = nx.pos; prev = nx.prev;
            if (pos === YUT_FINISH) return { pos, prev };
        }
        return { pos, prev };
    }

    tokensAt(player, node) {
        const out = [];
        this.players[player].tokens.forEach((t, i) => { if (t === node) out.push(i); });
        return out;
    }

    movableTokens() {
        const p = this.players[this.current];
        const out = []; const seen = new Set(); let waitShown = false;
        p.tokens.forEach((pos, i) => {
            if (pos === YUT_FINISH) return;
            if (pos === YUT_WAIT) { if (waitShown) return; waitShown = true; out.push(i); return; }
            if (seen.has(pos)) return; seen.add(pos); out.push(i);
        });
        return out;
    }

    tokenScreenPos(idx) {
        const pos = this.players[this.current].tokens[idx];
        return pos === YUT_WAIT ? this.waitPos(this.current, this._waitOrder(this.current, idx)) : this.nodePos(pos);
    }
    _waitOrder(player, idx) {
        // idx가 대기 말 중 몇 번째인지
        let k = 0;
        const toks = this.players[player].tokens;
        for (let i = 0; i < idx; i++) if (toks[i] === YUT_WAIT) k++;
        return k;
    }

    computeDestOptions(idx) {
        const pos = this.players[this.current].tokens[idx];
        const opts = []; const seenV = new Set();
        for (const r of this.results) {
            if (seenV.has(r.v)) continue; seenV.add(r.v);
            const dest = this.travel(pos, r.v).pos;
            const xy = dest === YUT_FINISH ? this.finishPos() : this.nodePos(dest);
            opts.push({ v: r.v, name: r.name, dest, x: xy.x, y: xy.y });
        }
        return opts;
    }

    // ─── 입력 (캔버스) ────────────────────────────────────────
    onCanvasClick(e) {
        if (this.isGameOver || this.busy) return;
        if (this.gameMode === 'ai' && this.current === 'p2') return;
        if (!this.results.length) {
            this.statusEl.textContent = this.canThrow ? (this.en ? 'Throw the yut' : '윷을 던지세요') : '';
            return;
        }
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        const R = this.W * 0.06;

        if (this.phase === 'selectDest') {
            // 목적지 마커 클릭?
            let pick = null, pd = R;
            for (const opt of this.destOptions) {
                const d = Math.hypot(x - opt.x, y - opt.y);
                if (d < pd) { pd = d; pick = opt; }
            }
            if (pick) { this.applyChosen(this.selectedToken, pick); return; }
            // 아니면 다른 말 재선택 시도 (아래로)
        }

        // 말 선택
        const movable = this.movableTokens();
        let pickIdx = null, pdist = this.W * 0.07;
        for (const i of movable) {
            const xy = this.tokenScreenPos(i);
            const d = Math.hypot(x - xy.x, y - xy.y);
            if (d < pdist) { pdist = d; pickIdx = i; }
        }
        if (pickIdx != null) {
            this.selectedToken = pickIdx;
            this.destOptions = this.computeDestOptions(pickIdx);
            this.phase = 'selectDest';
            this.updateStatus();
            this.draw();
        } else {
            // 빈 곳 클릭 → 선택 해제
            this.selectedToken = null;
            this.destOptions = [];
            this.phase = 'selectToken';
            this.updateStatus();
            this.draw();
        }
    }

    applyChosen(tokenIdx, opt) {
        // 결과 소비 (해당 값 1개)
        const ri = this.results.findIndex(r => r.v === opt.v);
        if (ri < 0) return;
        this.results.splice(ri, 1);
        const res = this.executeMove(this.current, tokenIdx, opt.v);
        this.selectedToken = null;
        this.destOptions = [];
        this.renderResults();
        if (res.captured) this.canThrow = true;
        this.draw();
        if (this.checkWin()) { this.stopGlow(); return; }
        this.afterMovePhase();
    }

    afterMovePhase() {
        if (this.results.length) { this.phase = 'selectToken'; }
        else if (this.canThrow) { this.phase = 'throw'; }
        else { this.endTurn(); return; }
        this.updateGlow();
        this.updateStatus();
        this.updateThrowBtn();
        this.draw();
    }

    executeMove(player, tokenIdx, value) {
        const p = this.players[player];
        const startPos = p.tokens[tokenIdx];
        const dest = this.travel(startPos, value).pos;
        let group = startPos === YUT_WAIT ? [tokenIdx] : this.tokensAt(player, startPos);
        group.forEach(i => { p.tokens[i] = dest; });
        let captured = false, finished = false;
        if (dest === YUT_FINISH) { group.forEach(() => p.done++); finished = true; }
        else {
            const opp = player === 'p1' ? 'p2' : 'p1';
            const hit = this.tokensAt(opp, dest);
            if (hit.length) { hit.forEach(i => this.players[opp].tokens[i] = YUT_WAIT); captured = true; }
        }
        return { dest, captured, finished };
    }

    checkWin() {
        for (const pk of ['p1','p2']) {
            if (this.players[pk].done >= 4) {
                this.isGameOver = true;
                setTimeout(() => {
                    let title, desc;
                    if (this.gameMode === 'ai') {
                        const win = pk === 'p1';
                        title = win ? (this.en ? 'You Win!' : '승리!') : (this.en ? 'You Lose' : '패배');
                        desc = win ? (this.en ? 'All 4 mal finished!' : '말 4개 완주!') : (this.en ? 'The AI finished first.' : 'AI가 먼저 완주했습니다.');
                    } else {
                        title = (this.en ? (pk==='p1'?'Red':'Blue') : (pk==='p1'?'빨강':'파랑')) + (this.en ? ' Wins!' : ' 승리!');
                        desc = this.en ? 'All 4 mal finished!' : '말 4개를 모두 완주했습니다!';
                    }
                    this.winTitle.textContent = title;
                    this.winDesc.textContent = desc;
                    this.winOverlay.classList.remove('hidden');
                }, 400);
                return true;
            }
        }
        return false;
    }

    endTurn() {
        this.results = [];
        this.selectedToken = null;
        this.destOptions = [];
        this.canThrow = true;
        this.phase = 'throw';
        this.throwResultEl.textContent = '';
        this.current = this.current === 'p1' ? 'p2' : 'p1';
        this.renderResults();
        this.updateGlow();
        this.draw();
        this.updateStatus();
        this.updateThrowBtn();
        if (this.gameMode === 'ai' && this.current === 'p2' && !this.isGameOver) {
            setTimeout(() => this.aiTurn(), 700);
        }
    }

    // ─── AI ──────────────────────────────────────────────────
    aiTurn() {
        if (this.isGameOver) return;
        this.busy = true;
        this.stopGlow();
        this.updateThrowBtn();
        const throwLoop = () => {
            if (this.canThrow) {
                const r = this.rollYut();
                this.results.push(r);
                this.canThrow = (r.name === '윷' || r.name === '모');
                this.throwResultEl.textContent = r.name + ' (' + r.v + ')';
                this.renderResults();
                setTimeout(throwLoop, 600);
            } else {
                setTimeout(() => this.aiMove(), 500);
            }
        };
        throwLoop();
    }

    aiMove() {
        if (this.isGameOver) { this.busy = false; return; }
        if (!this.results.length) {
            if (this.canThrow) { this.aiTurn(); return; }
            this.busy = false; this.endTurn(); return;
        }
        const p = this.players.p2;
        let best = null, bestScore = -Infinity; const seen = new Set();
        for (const res of this.results) {
            p.tokens.forEach((pos, i) => {
                if (pos === YUT_FINISH) return;
                if (pos !== YUT_WAIT) { if (seen.has(res.v + ':' + pos)) return; seen.add(res.v + ':' + pos); }
                const dest = this.travel(pos, res.v).pos;
                let score = 0;
                if (dest === YUT_FINISH) score += 100;
                const hit = this.tokensAt('p1', dest);
                if (dest !== YUT_FINISH && hit.length) score += 60 + this.progress(this.players.p1.tokens[hit[0]]) * 2;
                score += this.progress(dest) - this.progress(pos);
                if (pos === YUT_WAIT) score += 2;
                if (score > bestScore) { bestScore = score; best = { res, i }; }
            });
        }
        if (!best) { this.busy = false; this.endTurn(); return; }
        const ri = this.results.indexOf(best.res); if (ri >= 0) this.results.splice(ri, 1);
        const r = this.executeMove('p2', best.i, best.res.v);
        if (r.captured) this.canThrow = true;
        this.renderResults();
        this.draw();
        if (this.checkWin()) { this.busy = false; return; }
        setTimeout(() => this.aiMove(), 650);
    }

    progress(pos) {
        if (pos === YUT_WAIT) return 0;
        if (pos === YUT_FINISH) return 30;
        const order = {20:6.5,22:10,24:13.5,21:11.5,23:18};
        if (order[pos] != null) return order[pos];
        return pos;
    }

    waitPos(player, k) {
        const y = this.margin + k * (this.W * 0.11) + this.W * 0.05;
        return player === 'p1' ? { x: this.W - this.W*0.04, y } : { x: this.W*0.04, y };
    }

    // ─── 결과 칩 (표시 전용) ──────────────────────────────────
    renderResults() {
        this.resultsEl.innerHTML = '';
        this.results.forEach((r) => {
            const chip = document.createElement('span');
            chip.className = 'yut-chip';
            chip.textContent = (this.en ? this.engName(r.name) : r.name) + ' ' + r.v;
            this.resultsEl.appendChild(chip);
        });
    }

    updateThrowBtn() {
        const aiTurn = this.gameMode === 'ai' && this.current === 'p2';
        this.throwBtn.disabled = !this.canThrow || this.isGameOver || this.busy || aiTurn;
        this.throwBtn.style.opacity = this.throwBtn.disabled ? '0.5' : '1';
    }

    updateStatus() {
        const p1n = this.gameMode === 'ai' ? (this.en?'You':'나') : (this.en?'Red':'빨강');
        const p2n = this.gameMode === 'ai' ? 'AI' : (this.en?'Blue':'파랑');
        if (this.p1infoEl) this.p1infoEl.textContent = p1n + ' ' + (this.en?'done ':'완주 ') + this.players.p1.done + '/4';
        if (this.p2infoEl) this.p2infoEl.textContent = p2n + ' ' + (this.en?'done ':'완주 ') + this.players.p2.done + '/4';
        if (this.isGameOver) return;
        if (this.busy) { this.statusEl.textContent = (this.en?'AI is playing…':'AI 진행 중…'); return; }
        const who = this.current === 'p1' ? p1n : p2n;
        if (this.phase === 'selectDest') this.statusEl.textContent = this.en ? 'Pick a highlighted cell' : '이동할 칸(표시)을 누르세요';
        else if (this.phase === 'selectToken') this.statusEl.textContent = this.en ? 'Pick a glowing mal' : '움직일 말을 선택하세요';
        else if (this.canThrow) this.statusEl.textContent = who + (this.en?': throw the yut' : ' 차례 — 윷을 던지세요');
        else this.statusEl.textContent = who + (this.en?"'s turn" : ' 차례');
    }

    // ─── 반짝임 애니메이션 ───────────────────────────────────
    updateGlow() {
        const human = !(this.gameMode === 'ai' && this.current === 'p2');
        if (human && !this.isGameOver && (this.phase === 'selectToken' || this.phase === 'selectDest')) this.startGlow();
        else this.stopGlow();
    }
    startGlow() {
        if (this._glowRAF) return;
        const loop = (t) => { this.glow = (Math.sin(t / 280) + 1) / 2; this.draw(); this._glowRAF = requestAnimationFrame(loop); };
        this._glowRAF = requestAnimationFrame(loop);
    }
    stopGlow() {
        if (this._glowRAF) { cancelAnimationFrame(this._glowRAF); this._glowRAF = null; }
    }

    // ─── 그리기 ──────────────────────────────────────────────
    draw() {
        const ctx = this.ctx;
        if (!ctx) return;
        ctx.clearRect(0,0,this.W,this.H);
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,this.W,this.H);

        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
        const seg = (a,b) => { const A=this.nodePos(a),B=this.nodePos(b); ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke(); };
        for (let i=0;i<20;i++) seg(i,(i+1)%20);
        seg(5,20); seg(20,22); seg(22,24); seg(24,15);
        seg(10,21); seg(21,22); seg(22,23); seg(23,0);

        for (let id=0; id<=24; id++) {
            if (this.coords[id] === undefined) continue;
            const {x,y} = this.nodePos(id);
            const big = this.bigNodes.includes(id);
            const r = big ? this.W*0.045 : this.W*0.03;
            ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
            ctx.fillStyle = big ? '#deae6c' : 'rgba(222,174,108,0.6)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(90,60,30,0.7)'; ctx.lineWidth = 2; ctx.stroke();
        }
        const s0 = this.nodePos(0);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${Math.floor(this.W*0.03)}px Outfit, sans-serif`;
        ctx.textAlign='center'; ctx.fillText(this.en?'START':'출발', s0.x, s0.y - this.W*0.06);

        // 말
        const byNode = {};
        for (const pk of ['p1','p2']) this.players[pk].tokens.forEach((pos) => {
            if (pos === YUT_WAIT || pos === YUT_FINISH) return;
            (byNode[pos] = byNode[pos] || []).push(pk);
        });
        Object.keys(byNode).forEach(node => {
            const pk = byNode[node][0];
            const {x,y} = this.nodePos(+node);
            const col = pk === 'p1' ? '#ef4444' : '#3b82f6';
            const r = this.W*0.032;
            ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
            const g = ctx.createRadialGradient(x-r*0.3,y-r*0.3,r*0.1,x,y,r);
            g.addColorStop(0, pk==='p1'?'#ff9a9a':'#9ec2ff'); g.addColorStop(1, col);
            ctx.fillStyle = g; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            const cnt = this.tokensAt(pk, +node).length;
            if (cnt > 1) {
                ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(this.W*0.035)}px Outfit, sans-serif`;
                ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(cnt, x, y); ctx.textBaseline='alphabetic';
            }
        });

        // 대기 말
        for (const pk of ['p1','p2']) {
            let k = 0;
            this.players[pk].tokens.forEach(t => {
                if (t !== YUT_WAIT) return;
                const xy = this.waitPos(pk, k); k++;
                const col = pk === 'p1' ? '#ef4444' : '#3b82f6';
                ctx.beginPath(); ctx.arc(xy.x, xy.y, this.W*0.022, 0, Math.PI*2);
                ctx.fillStyle = col; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
            });
        }

        const human = !(this.gameMode === 'ai' && this.current === 'p2');

        // 선택 가능한 말 반짝임
        if (human && !this.isGameOver && this.phase === 'selectToken') {
            const a = 0.35 + 0.5 * this.glow;
            const rr = this.W * (0.05 + 0.012 * this.glow);
            for (const i of this.movableTokens()) {
                const xy = this.tokenScreenPos(i);
                ctx.beginPath(); ctx.arc(xy.x, xy.y, rr, 0, Math.PI*2);
                ctx.strokeStyle = `rgba(250,204,21,${a})`; ctx.lineWidth = 3; ctx.stroke();
            }
        }

        // 선택된 말 + 목적지 표시
        if (human && !this.isGameOver && this.phase === 'selectDest') {
            const sxy = this.tokenScreenPos(this.selectedToken);
            ctx.beginPath(); ctx.arc(sxy.x, sxy.y, this.W*0.05, 0, Math.PI*2);
            ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3.5; ctx.stroke();
            for (const opt of this.destOptions) {
                const a = 0.45 + 0.45 * this.glow;
                ctx.beginPath(); ctx.arc(opt.x, opt.y, this.W*0.04, 0, Math.PI*2);
                ctx.fillStyle = `rgba(34,197,94,${0.25 + 0.25*this.glow})`; ctx.fill();
                ctx.strokeStyle = `rgba(74,222,128,${a})`; ctx.lineWidth = 3; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(this.W*0.03)}px Outfit, sans-serif`;
                ctx.textAlign='center'; ctx.textBaseline='middle';
                ctx.fillText(this.en ? this.engName(opt.name)[0] : opt.name, opt.x, opt.y);
                ctx.textBaseline='alphabetic';
            }
        }
    }

    refreshLang() {
        if (!this.isGameOver) this.updateStatus();
        this.renderResults();
    }
}

window.yutGame = new YutGame();
