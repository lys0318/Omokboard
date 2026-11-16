// 사다리타기 (Ladder / Amidakuji) — 인원 2~6, 결과 직접 입력
class Ladder {
    constructor() {
        this.ROWS = 9; // 내부 사다리 단(段) 수
        this.STEP_MS = 90; // 레벨 하나 내려가는 데 걸리는 시간
        this.PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];
        this.n = 4;
        this.rungs = [];
        this.tops = [];
        this.results = [];
        this.xs = [];
        this.animating = new Map();  // col -> { step, pts, destCol, color }
        this.revealedPaths = [];     // { col, destCol, color, pts } (다 내려간 것들, 계속 화면에 유지)
        this.tickerId = null;

        this.stageEl = document.querySelector('.ladder-stage');
        this.topsEl = document.getElementById('ladder-tops');
        this.resultsEl = document.getElementById('ladder-results');
        this.canvas = document.getElementById('ladder-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.statusEl = document.getElementById('ladder-status');
        this.summaryEl = document.getElementById('ladder-summary');
        this.modeOverlay = document.getElementById('ladder-mode-overlay');

        this.bindEvents();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }

    bindEvents() {
        this.modeOverlay.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.modeOverlay.classList.add('hidden');
                this.setup(parseInt(btn.dataset.n, 10));
            });
        });
        document.getElementById('ladder-shuffle-btn').addEventListener('click', () => this.shuffle());
        document.getElementById('ladder-revealall-btn').addEventListener('click', () => this.revealAll());
        document.getElementById('ladder-reset-btn').addEventListener('click', () => {
            this.modeOverlay.classList.remove('hidden');
        });
    }

    setup(n) {
        this.n = n;
        this.tops = Array.from({ length: n }, () => '');
        this.results = Array.from({ length: n }, (_, i) => (this.en ? 'Result ' : '결과') + (i + 1));
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.xs = this.computeXs(n, this.canvas.width, 28);
        this.buildTops();
        this.buildResults();
        this.rungs = this.generateRungs(n);
        this.stopAnimation();
        this.statusEl.innerHTML = this.en
            ? '<span>Fill in a box, then tap it to reveal the result</span>'
            : '<span>빈칸에 입력 후 눌러 결과를 확인하세요</span>';
        this.summaryEl.textContent = '';
        this.draw();
    }

    stopAnimation() {
        clearInterval(this.tickerId);
        this.tickerId = null;
        this.animating.clear();
        this.revealedPaths = [];
    }

    computeXs(n, width, margin) {
        if (n === 1) return [width / 2];
        const step = (width - margin * 2) / (n - 1);
        return Array.from({ length: n }, (_, i) => margin + i * step);
    }

    buildTops() {
        this.topsEl.innerHTML = '';
        for (let i = 0; i < this.n; i++) {
            const inp = document.createElement('input');
            inp.className = 'ladder-top-btn';
            inp.value = this.tops[i];
            inp.maxLength = 4;
            inp.style.left = this.xs[i] + 'px';
            inp.addEventListener('input', (e) => { this.tops[i] = e.target.value; });
            inp.addEventListener('click', () => { if (inp.value.trim()) this.reveal(i); });
            this.topsEl.appendChild(inp);
        }
    }

    buildResults() {
        this.resultsEl.innerHTML = '';
        for (let i = 0; i < this.n; i++) {
            const inp = document.createElement('input');
            inp.className = 'ladder-result-input';
            inp.value = this.results[i];
            inp.style.left = this.xs[i] + 'px';
            inp.addEventListener('input', (e) => { this.results[i] = e.target.value; });
            this.resultsEl.appendChild(inp);
        }
    }

    // 공정한 사다리: 가로줄을 무작위로만 그으면 9단으로는 섞임이 모자라 자기 자리 근처로 떨어지기 쉽다
    // (6명이면 1번이 1번 결과 30%, 6번 결과 4%로 실측). 그래서 결과 배정을 균등한 무작위 순열로 먼저 정하고,
    // 그 순열이 나오도록 가로줄을 놓는다(홀짝 정렬은 n단이면 충분). 남는 단에는 같은 줄을 두 번 연달아
    // 넣어(서로 상쇄) 사다리 모양을 채운다. 검사: scripts/solo-stats.mjs ladder
    generateRungs(n) {
        const randomRow = () => {
            const row = new Array(n - 1).fill(false);
            let i = 0;
            while (i < n - 1) {
                if (Math.random() < 0.5) { row[i] = true; i += 2; }
                else i += 1;
            }
            return row;
        };
        // 아래쪽 열 배치(order[열] = 그 열에 도착할 출발 번호)를 균등 무작위로
        const order = [...Array(n).keys()];
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        // order를 홀짝 교환으로 정렬하는 단들을 거꾸로 쌓으면 위(0,1,…)에서 order로 가는 사다리가 된다
        const rungs = [];
        for (let r = 0; r < n; r++) {
            const row = new Array(n - 1).fill(false);
            for (let i = r % 2; i < n - 1; i += 2) {
                if (order[i] > order[i + 1]) { [order[i], order[i + 1]] = [order[i + 1], order[i]]; row[i] = true; }
            }
            rungs.unshift(row);
        }
        while (rungs.length + 2 <= this.ROWS) {
            const row = randomRow(), at = Math.floor(Math.random() * (rungs.length + 1));
            rungs.splice(at, 0, row, row.slice());
        }
        while (rungs.length < this.ROWS) rungs.splice(Math.floor(Math.random() * (rungs.length + 1)), 0, new Array(n - 1).fill(false));
        return rungs;
    }

    // startCol에서 출발해 사다리를 타고 내려간 경로(pts)와 도착 열(col)을 계산
    trace(startCol) {
        const h = this.canvas.height;
        let col = startCol;
        const pts = [{ x: this.xs[col], y: 0 }];
        for (let r = 1; r <= this.ROWS; r++) {
            const y = (r * h) / (this.ROWS + 1);
            pts.push({ x: this.xs[col], y });
            const row = this.rungs[r - 1];
            if (col > 0 && row[col - 1]) { col -= 1; pts.push({ x: this.xs[col], y }); }
            else if (col < this.n - 1 && row[col]) { col += 1; pts.push({ x: this.xs[col], y }); }
        }
        pts.push({ x: this.xs[col], y: h });
        return { col, pts };
    }

    // pts 중 y <= maxY인 부분까지만 잘라낸 부분 경로 (레벨 경계값과 정확히 일치하는 y만 넘어오므로 보간 불필요)
    clipPts(pts, maxY) {
        const out = [];
        for (const p of pts) {
            if (p.y > maxY) break;
            out.push(p);
        }
        return out;
    }

    draw(layers) {
        const { ctx, canvas, xs, n } = this;
        const h = canvas.height;
        ctx.clearRect(0, 0, canvas.width, h);

        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        for (const x of xs) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let r = 0; r < this.ROWS; r++) {
            const y = ((r + 1) * h) / (this.ROWS + 1);
            const row = this.rungs[r];
            for (let i = 0; i < n - 1; i++) {
                if (!row[i]) continue;
                ctx.beginPath();
                ctx.moveTo(xs[i], y);
                ctx.lineTo(xs[i + 1], y);
                ctx.stroke();
            }
        }

        for (const { pts, color } of layers || []) {
            if (pts.length < 2) continue;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 5, 0, Math.PI * 2); ctx.fill();
        }
    }

    renderFrame() {
        const layers = this.revealedPaths.map(p => ({ pts: p.pts, color: p.color }));
        const h = this.canvas.height;
        for (const anim of this.animating.values()) {
            const y = anim.step >= this.ROWS + 1 ? h : (anim.step * h) / (this.ROWS + 1);
            layers.push({ pts: this.clipPts(anim.pts, y), color: anim.color });
        }
        this.draw(layers);
    }

    reveal(startCol) {
        this.revealedPaths = this.revealedPaths.filter(p => p.col !== startCol);
        const { col, pts } = this.trace(startCol);
        const color = this.PALETTE[startCol % this.PALETTE.length];
        this.animating.set(startCol, { step: 0, pts, destCol: col, color });
        this.topsEl.children[startCol].classList.add('done');
        this.summaryEl.textContent = '';
        this.startTicker();
    }

    startTicker() {
        if (this.tickerId) return;
        this.tickerId = setInterval(() => {
            for (const [startCol, anim] of [...this.animating]) {
                anim.step++;
                if (anim.step >= this.ROWS + 1) {
                    this.animating.delete(startCol);
                    this.revealedPaths.push({ col: startCol, destCol: anim.destCol, color: anim.color, pts: anim.pts });
                    this.onRevealDone(startCol, anim.destCol, anim.color);
                }
            }
            this.renderFrame();
            if (this.animating.size === 0) { clearInterval(this.tickerId); this.tickerId = null; }
        }, this.STEP_MS);
    }

    onRevealDone(startCol, destCol, color) {
        const input = this.resultsEl.children[destCol];
        input.classList.add('landed');
        input.style.borderColor = color;
        this.statusEl.textContent = `${this.tops[startCol]} → ${this.results[destCol]}`;
    }

    revealAll() {
        if (this.tops.some(t => !t.trim())) {
            this.statusEl.textContent = this.en ? 'Please fill in every box' : '빈칸을 채워주세요';
            return;
        }
        this.animating.clear();
        clearInterval(this.tickerId);
        this.tickerId = null;
        this.revealedPaths = [];
        const mapping = [];
        for (let i = 0; i < this.n; i++) {
            const { col, pts } = this.trace(i);
            const color = this.PALETTE[i % this.PALETTE.length];
            this.revealedPaths.push({ col: i, destCol: col, color, pts });
            mapping.push(`${this.tops[i]} → ${this.results[col]}`);
            this.topsEl.children[i].classList.add('done');
            const input = this.resultsEl.children[col];
            input.classList.add('landed');
            input.style.borderColor = color;
        }
        this.renderFrame();
        this.statusEl.textContent = this.en ? 'All paths revealed' : '전체 경로 공개됨';
        this.summaryEl.textContent = mapping.join('   ·   ');
    }

    shuffle() {
        this.rungs = this.generateRungs(this.n);
        this.stopAnimation();
        this.topsEl.querySelectorAll('.ladder-top-btn').forEach(el => el.classList.remove('done'));
        this.resultsEl.querySelectorAll('.ladder-result-input').forEach(el => { el.classList.remove('landed'); el.style.borderColor = ''; });
        this.statusEl.textContent = this.en ? 'Ladder reshuffled' : '사다리를 다시 섞었습니다';
        this.summaryEl.textContent = '';
        this.draw();
    }
}

window.ladderGame = new Ladder();
