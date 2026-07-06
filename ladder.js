// 사다리타기 (Ladder / Amidakuji) — 인원 2~6, 결과 직접 입력
class Ladder {
    constructor() {
        this.ROWS = 9; // 내부 사다리 단(段) 수
        this.PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];
        this.n = 4;
        this.rungs = [];
        this.results = [];
        this.xs = [];

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
        this.results = Array.from({ length: n }, (_, i) => (this.en ? 'Result ' : '결과') + (i + 1));
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.xs = this.computeXs(n, this.canvas.width, 28);
        this.buildTops();
        this.buildResults();
        this.rungs = this.generateRungs(n);
        this.usedCols = new Set();
        this.statusEl.innerHTML = this.en
            ? '<span>Tap a number to reveal its result</span>'
            : '<span>번호를 눌러 결과를 확인하세요</span>';
        this.summaryEl.textContent = '';
        this.draw();
    }

    computeXs(n, width, margin) {
        if (n === 1) return [width / 2];
        const step = (width - margin * 2) / (n - 1);
        return Array.from({ length: n }, (_, i) => margin + i * step);
    }

    buildTops() {
        this.topsEl.innerHTML = '';
        for (let i = 0; i < this.n; i++) {
            const b = document.createElement('button');
            b.className = 'ladder-top-btn';
            b.textContent = i + 1;
            b.style.left = this.xs[i] + 'px';
            b.addEventListener('click', () => this.reveal(i));
            this.topsEl.appendChild(b);
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

    generateRungs(n) {
        const rungs = [];
        for (let r = 0; r < this.ROWS; r++) {
            const row = new Array(n - 1).fill(false);
            let i = 0;
            while (i < n - 1) {
                if (Math.random() < 0.5) { row[i] = true; i += 2; }
                else i += 1;
            }
            rungs.push(row);
        }
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

    draw(highlights) {
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

        if (!highlights) return;
        for (const { col, color } of highlights) {
            const { pts } = this.trace(col);
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

    reveal(startCol) {
        this.resultsEl.querySelectorAll('.ladder-result-input').forEach(el => { el.classList.remove('landed'); el.style.borderColor = ''; });
        this.topsEl.querySelectorAll('.ladder-top-btn').forEach(el => el.classList.remove('done'));

        const { col } = this.trace(startCol);
        this.draw([{ col: startCol, color: '#facc15' }]);
        this.topsEl.children[startCol].classList.add('done');
        this.resultsEl.children[col].classList.add('landed');
        this.usedCols.add(startCol);
        const label = this.en ? `#${startCol + 1} → ` : `${startCol + 1}번 → `;
        this.statusEl.textContent = label + this.results[col];
        this.summaryEl.textContent = '';
    }

    revealAll() {
        const highlights = [];
        const mapping = [];
        for (let i = 0; i < this.n; i++) {
            const { col } = this.trace(i);
            highlights.push({ col: i, color: this.PALETTE[i % this.PALETTE.length] });
            mapping.push(`${i + 1} → ${this.results[col]}`);
            this.topsEl.children[i].classList.add('done');
        }
        this.draw(highlights);
        this.statusEl.textContent = this.en ? 'All paths revealed' : '전체 경로 공개됨';
        this.summaryEl.textContent = mapping.join('   ·   ');
    }

    shuffle() {
        this.rungs = this.generateRungs(this.n);
        this.usedCols = new Set();
        this.topsEl.querySelectorAll('.ladder-top-btn').forEach(el => el.classList.remove('done'));
        this.resultsEl.querySelectorAll('.ladder-result-input').forEach(el => { el.classList.remove('landed'); el.style.borderColor = ''; });
        this.statusEl.textContent = this.en ? 'Ladder reshuffled' : '사다리를 다시 섞었습니다';
        this.summaryEl.textContent = '';
        this.draw();
    }
}

window.ladderGame = new Ladder();
