// 윷놀이 (Yut Nori) — 표준 윷판(외곽 + 대각선 지름길) · PvP + AI
// 노드: 0~19 외곽, 20~24 대각선/중앙, FINISH=99, WAIT=-1
const YUT_FINISH = 99, YUT_WAIT = -1;

class YutGame {
    constructor() {
        // 노드 좌표 (0~5 격자)
        this.coords = {
            0:[5,5],1:[5,4],2:[5,3],3:[5,2],4:[5,1],5:[5,0],
            6:[4,0],7:[3,0],8:[2,0],9:[1,0],10:[0,0],
            11:[0,1],12:[0,2],13:[0,3],14:[0,4],15:[0,5],
            16:[1,5],17:[2,5],18:[3,5],19:[4,5],
            20:[3.75,1.25],21:[1.25,1.25],22:[2.5,2.5],23:[3.75,3.75],24:[1.25,3.75]
        };
        this.bigNodes = [0,5,10,15,22]; // 모서리·중앙 (지름길 분기점)

        this.players = {
            p1: { color:'red',  tokens:[YUT_WAIT,YUT_WAIT,YUT_WAIT,YUT_WAIT], done:0 },
            p2: { color:'blue', tokens:[YUT_WAIT,YUT_WAIT,YUT_WAIT,YUT_WAIT], done:0 }
        };
        this.current = 'p1';
        this.gameMode = 'pvp';
        this.vsAI = false;
        this.difficulty = 'normal';
        this.results = [];      // 사용 가능한 이동값 [{v,name}]
        this.canThrow = true;
        this.selectedResult = null;
        this.isGameOver = false;
        this.busy = false;      // 애니메이션/AI 중 입력 잠금

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
        this.selectedResult = null;
        this.isGameOver = false;
        this.busy = false;
        this.throwResultEl.textContent = '';
        this.draw();
        this.renderResults();
        this.updateStatus();
        this.updateThrowBtn();
    }

    // ─── 윷 던지기 ────────────────────────────────────────────
    rollYut() {
        let flats = 0;
        for (let i = 0; i < 4; i++) if (Math.random() < 0.5) flats++;
        // flats: 1도 2개 3걸 4윷 0모
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
        this.updateThrowBtn();
        this.updateStatus();
        // 움직일 수 있는 말이 없고 더 던질 수도 없으면 턴 종료
        if (!this.canThrow && !this.hasAnyMove()) {
            this.setStatusNoMove();
            setTimeout(() => this.endTurn(), 900);
        }
    }

    engName(n){ return ({'도':'Do','개':'Gae','걸':'Geol','윷':'Yut','모':'Mo'})[n]; }

    hasAnyMove() {
        if (!this.results.length) return false;
        const p = this.players[this.current];
        // 대기 말이 있거나 보드 위 말이 있으면 이동 가능
        return p.tokens.some(t => t !== YUT_FINISH);
    }

    setStatusNoMove() {
        this.statusEl.textContent = this.en ? 'No moves — turn passes' : '움직일 말이 없어 턴 넘김';
    }

    // ─── 이동 ────────────────────────────────────────────────
    nextNode(pos, prev, firstStep) {
        if (pos === YUT_WAIT) return { pos: 0, prev: YUT_WAIT }; // 진입은 별도 처리
        // 분기점: 말이 정확히 그 칸에 멈춰 있던 경우(=지름길 진입)
        if (firstStep && pos === 5)  return { pos: 20, prev: 5 };
        if (firstStep && pos === 10) return { pos: 21, prev: 10 };
        if (firstStep && pos === 22) return { pos: 23, prev: 22 }; // 중앙에서 출발 → 최단(B) 출구
        // 대각선 통과
        if (pos === 20) return { pos: 22, prev: 20 };
        if (pos === 21) return { pos: 22, prev: 21 };
        if (pos === 22) return (prev === 20) ? { pos: 24, prev: 22 } : { pos: 23, prev: 22 };
        if (pos === 24) return { pos: 15, prev: 24 };
        if (pos === 23) return { pos: YUT_FINISH, prev: 23 };
        // 외곽
        if (pos === 19) return { pos: YUT_FINISH, prev: 19 };
        return { pos: pos + 1, prev: pos };
    }

    // 시작 노드 pos에서 steps 칸 이동한 최종 노드
    travel(startPos, steps) {
        if (startPos === YUT_WAIT) {
            // 진입: value 만큼 (도=1 → 0번 칸)
            let pos = 0, prev = YUT_WAIT;
            for (let s = 1; s < steps; s++) {
                const nx = this.nextNode(pos, prev, s === 1 && false);
                pos = nx.pos; prev = nx.prev;
                if (pos === YUT_FINISH) return { pos, prev };
            }
            return { pos, prev };
        }
        let pos = startPos, prev = this._tokenPrev(startPos);
        for (let s = 0; s < steps; s++) {
            const nx = this.nextNode(pos, prev, s === 0);
            pos = nx.pos; prev = nx.prev;
            if (pos === YUT_FINISH) return { pos, prev };
        }
        return { pos, prev };
    }

    _tokenPrev() { return -2; } // 통과 시 prev는 분기점 외에는 의미 없음 (중앙 통과만 중요 → travel이 직접 추적)

    // 보드 위 같은 노드의 내 말 인덱스들
    tokensAt(player, node) {
        const out = [];
        this.players[player].tokens.forEach((t, i) => { if (t === node) out.push(i); });
        return out;
    }

    movableTokens() {
        if (!this.selectedResult) return [];
        const steps = this.selectedResult.v;
        const p = this.players[this.current];
        const seenNodes = new Set();
        const list = [];
        p.tokens.forEach((pos, i) => {
            if (pos === YUT_FINISH) return;
            // 같은 노드 말은 한 번만 (업힌 말은 같이 이동)
            const key = pos;
            if (pos !== YUT_WAIT && seenNodes.has(key)) return;
            if (pos !== YUT_WAIT) seenNodes.add(key);
            list.push(i);
        });
        return list;
    }

    applyMove(tokenIdx) {
        if (!this.selectedResult) return;
        const steps = this.selectedResult.v;
        const p = this.players[this.current];
        const startPos = p.tokens[tokenIdx];
        const dest = this.travel(startPos, steps).pos;

        // 같은 칸의 내 말들 함께 이동(업기)
        let group = [tokenIdx];
        if (startPos !== YUT_WAIT) group = this.tokensAt(this.current, startPos);

        group.forEach(i => { p.tokens[i] = dest; });

        // 결과 소비
        const ri = this.results.indexOf(this.selectedResult);
        if (ri >= 0) this.results.splice(ri, 1);
        this.selectedResult = null;

        let captured = false;
        if (dest === YUT_FINISH) {
            group.forEach(() => { p.done++; });
        } else {
            // 잡기
            const opp = this.current === 'p1' ? 'p2' : 'p1';
            const oppHit = this.tokensAt(opp, dest);
            if (oppHit.length) {
                oppHit.forEach(i => { this.players[opp].tokens[i] = YUT_WAIT; });
                captured = true;
            }
        }

        if (captured) this.canThrow = true; // 잡으면 한 번 더

        this.draw();
        this.renderResults();

        if (this.checkWin()) return;

        // 턴 종료 판단: 결과 없고 더 못 던지면 종료
        if (!this.results.length && !this.canThrow) {
            this.endTurn();
        } else {
            this.updateStatus();
            this.updateThrowBtn();
            if (captured && this.gameMode === 'ai' && this.current === 'p2') {
                setTimeout(() => this.aiTurn(), 700);
            }
        }
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
        this.selectedResult = null;
        this.canThrow = true;
        this.throwResultEl.textContent = '';
        this.current = this.current === 'p1' ? 'p2' : 'p1';
        this.renderResults();
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
        this.updateThrowBtn();
        // 던질 수 있을 때까지 던지기
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
        // 각 (결과, 말) 조합 평가
        const p = this.players.p2;
        let best = null, bestScore = -Infinity;
        const seen = new Set();
        for (const res of this.results) {
            p.tokens.forEach((pos, i) => {
                if (pos === YUT_FINISH) return;
                if (pos !== YUT_WAIT) { if (seen.has(res.v + ':' + pos)) return; seen.add(res.v + ':' + pos); }
                const dest = this.travel(pos, res.v).pos;
                let score = 0;
                if (dest === YUT_FINISH) score += 100;
                const oppHit = this.tokensAt('p1', dest);
                if (dest !== YUT_FINISH && oppHit.length) score += 60 + this.progress(this.players.p1.tokens[oppHit[0]]) * 2;
                score += this.progress(dest) - this.progress(pos);
                if (pos === YUT_WAIT) score += 2; // 새 말 투입도 가치
                if (score > bestScore) { bestScore = score; best = { res, i }; }
            });
        }
        if (!best) { this.busy = false; this.endTurn(); return; }
        this.selectedResult = best.res;
        const capturedBefore = this.canThrow;
        this.applyMoveAI(best.i);
    }

    applyMoveAI(tokenIdx) {
        // applyMove와 동일하나 AI 흐름 유지
        const res = this.selectedResult;
        const p = this.players.p2;
        const startPos = p.tokens[tokenIdx];
        const dest = this.travel(startPos, res.v).pos;
        let group = startPos === YUT_WAIT ? [tokenIdx] : this.tokensAt('p2', startPos);
        group.forEach(i => { p.tokens[i] = dest; });
        const ri = this.results.indexOf(res); if (ri >= 0) this.results.splice(ri, 1);
        this.selectedResult = null;
        let captured = false;
        if (dest === YUT_FINISH) { group.forEach(() => p.done++); }
        else {
            const oppHit = this.tokensAt('p1', dest);
            if (oppHit.length) { oppHit.forEach(i => this.players.p1.tokens[i] = YUT_WAIT); captured = true; }
        }
        if (captured) this.canThrow = true;
        this.draw(); this.renderResults();
        if (this.checkWin()) { this.busy = false; return; }
        setTimeout(() => this.aiMove(), 600);
    }

    progress(pos) {
        if (pos === YUT_WAIT) return 0;
        if (pos === YUT_FINISH) return 30;
        // 대략적 진행도 (지름길은 더 가깝게)
        const order = {20:6.5,22:10,24:13.5,21:11.5,23:18};
        if (order[pos] != null) return order[pos];
        return pos; // 외곽 0~19
    }

    // ─── 입력 (캔버스) ────────────────────────────────────────
    onCanvasClick(e) {
        if (this.isGameOver || this.busy) return;
        if (this.gameMode === 'ai' && this.current === 'p2') return;
        if (!this.selectedResult) { this.statusEl.textContent = this.en ? 'Pick a result first' : '먼저 결과를 선택하세요'; return; }
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        const movable = this.movableTokens();
        // 클릭 위치에서 가장 가까운 이동 가능 말
        let pick = null, pd = 28;
        const p = this.players[this.current];
        for (const i of movable) {
            const pos = p.tokens[i];
            const xy = pos === YUT_WAIT ? this.waitPos(this.current, i) : this.nodePos(pos);
            const d = Math.hypot(x - xy.x, y - xy.y);
            if (d < pd) { pd = d; pick = i; }
        }
        if (pick != null) this.applyMove(pick);
    }

    waitPos(player, i) {
        // 대기 말 표시 위치 (보드 밖 좌/우)
        const y = this.margin + i * (this.W * 0.12) + this.W * 0.05;
        return player === 'p1' ? { x: this.W - 12, y } : { x: 12, y };
    }

    // ─── 결과 칩 ─────────────────────────────────────────────
    renderResults() {
        this.resultsEl.innerHTML = '';
        this.results.forEach((r) => {
            const chip = document.createElement('button');
            chip.className = 'yut-chip' + (this.selectedResult === r ? ' sel' : '');
            chip.textContent = (this.en ? this.engName(r.name) : r.name) + ' ' + r.v;
            chip.addEventListener('click', () => {
                if (this.gameMode === 'ai' && this.current === 'p2') return;
                this.selectedResult = (this.selectedResult === r) ? null : r;
                this.renderResults(); this.draw();
                this.statusEl.textContent = this.selectedResult
                    ? (this.en ? 'Pick a mal to move' : '이동할 말을 선택하세요')
                    : (this.en ? 'Pick a result' : '결과를 선택하세요');
            });
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
        const who = this.current === 'p1' ? p1n : p2n;
        if (this.busy) { this.statusEl.textContent = (this.en?'AI is playing…':'AI 진행 중…'); return; }
        if (this.canThrow && !this.results.length) this.statusEl.textContent = who + (this.en?': throw the yut' : ' 차례 — 윷을 던지세요');
        else if (this.results.length) this.statusEl.textContent = (this.en?'Pick a result & mal':'결과·말을 선택하세요');
        else this.statusEl.textContent = who + (this.en?"'s turn" : ' 차례');
    }

    // ─── 그리기 ──────────────────────────────────────────────
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0,0,this.W,this.H);
        // 배경
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,this.W,this.H);

        // 연결선
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
        const seg = (a,b) => { const A=this.nodePos(a),B=this.nodePos(b); ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke(); };
        for (let i=0;i<20;i++) seg(i,(i+1)%20);
        seg(5,20); seg(20,22); seg(22,24); seg(24,15);
        seg(10,21); seg(21,22); seg(22,23); seg(23,0);

        // 노드
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
        // 시작 표시
        const s0 = this.nodePos(0);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${Math.floor(this.W*0.03)}px Outfit, sans-serif`;
        ctx.textAlign='center'; ctx.fillText(this.en?'START':'출발', s0.x, s0.y - this.W*0.06);

        // 말 그리기 (노드별 그룹)
        const byNode = {};
        for (const pk of ['p1','p2']) {
            this.players[pk].tokens.forEach((pos, i) => {
                if (pos === YUT_WAIT || pos === YUT_FINISH) return;
                (byNode[pos] = byNode[pos] || []).push(pk);
            });
        }
        Object.keys(byNode).forEach(node => {
            const list = byNode[node];
            const {x,y} = this.nodePos(+node);
            const pk = list[0];
            const col = pk === 'p1' ? '#ef4444' : '#3b82f6';
            const r = this.W*0.032;
            ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
            const g = ctx.createRadialGradient(x-r*0.3,y-r*0.3,r*0.1,x,y,r);
            g.addColorStop(0, pk==='p1'?'#ff9a9a':'#9ec2ff'); g.addColorStop(1, col);
            ctx.fillStyle = g; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            // 업힌 말 개수
            const cnt = this.tokensAt(pk, +node).length;
            if (cnt > 1) {
                ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(this.W*0.035)}px Outfit, sans-serif`;
                ctx.textAlign='center'; ctx.textBaseline='middle';
                ctx.fillText(cnt, x, y);
                ctx.textBaseline='alphabetic';
            }
        });

        // 이동 가능 말 하이라이트
        if (this.selectedResult && !(this.gameMode==='ai' && this.current==='p2')) {
            const movable = this.movableTokens();
            const p = this.players[this.current];
            movable.forEach(i => {
                const pos = p.tokens[i];
                const xy = pos === YUT_WAIT ? this.waitPos(this.current, i) : this.nodePos(pos);
                ctx.beginPath(); ctx.arc(xy.x, xy.y, this.W*0.045, 0, Math.PI*2);
                ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke();
            });
        }

        // 대기 말 표시
        for (const pk of ['p1','p2']) {
            const waiting = this.players[pk].tokens.filter(t => t === YUT_WAIT).length;
            const col = pk === 'p1' ? '#ef4444' : '#3b82f6';
            for (let k=0;k<waiting;k++){
                const idxToken = this.players[pk].tokens.findIndex((t,ii)=>t===YUT_WAIT && ii>= 0);
                const xy = this.waitPos(pk, k);
                ctx.beginPath(); ctx.arc(xy.x, xy.y, this.W*0.025, 0, Math.PI*2);
                ctx.fillStyle = col; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
            }
        }
    }

    refreshLang() {
        if (!this.isGameOver) this.updateStatus();
        this.renderResults();
    }
}

window.yutGame = new YutGame();
