// 2048 — 1인, 방향키/스와이프로 타일 합치기
class Game2048 {
    constructor() {
        this.BEST_KEY = 'omokboard2048best';
        this.grid = [];
        this.score = 0;
        this.best = parseInt(localStorage.getItem(this.BEST_KEY) || '0', 10);
        this.over = false;
        this.won = false;
        this.continued = false;

        this.boardEl = document.getElementById('g2048-board');
        this.scoreEl = document.getElementById('g2048-score');
        this.bestEl = document.getElementById('g2048-best');
        this.winOverlay = document.getElementById('g2048-win-overlay');
        this.overOverlay = document.getElementById('g2048-over-overlay');
        this.overDesc = document.getElementById('g2048-over-desc');

        this.buildBoard();
        this.bindEvents();
        this.newGame();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }

    buildBoard() {
        this.boardEl.innerHTML = '';
        for (let i = 0; i < 16; i++) {
            const c = document.createElement('div');
            c.className = 'g2048-cell';
            this.boardEl.appendChild(c);
        }
    }

    bindEvents() {
        document.getElementById('g2048-reset-btn').addEventListener('click', () => this.newGame());
        document.getElementById('g2048-continue-btn').addEventListener('click', () => {
            this.continued = true;
            this.winOverlay.classList.add('hidden');
        });
        document.getElementById('g2048-newgame-btn').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.newGame();
        });
        document.getElementById('g2048-retry-btn').addEventListener('click', () => {
            this.overOverlay.classList.add('hidden');
            this.newGame();
        });

        document.addEventListener('keydown', (e) => {
            const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
            const dir = map[e.key];
            if (!dir) return;
            e.preventDefault();
            this.move(dir);
        });

        let sx = 0, sy = 0;
        this.boardEl.addEventListener('touchstart', (e) => {
            sx = e.touches[0].clientX; sy = e.touches[0].clientY;
        }, { passive: true });
        this.boardEl.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - sx;
            const dy = e.changedTouches[0].clientY - sy;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
            if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 'right' : 'left');
            else this.move(dy > 0 ? 'down' : 'up');
        }, { passive: true });
    }

    newGame() {
        this.grid = Array(16).fill(0);
        this.score = 0;
        this.over = false;
        this.won = false;
        this.continued = false;
        this.winOverlay.classList.add('hidden');
        this.overOverlay.classList.add('hidden');
        this.addRandom();
        this.addRandom();
        this.render();
    }

    addRandom() {
        const empties = [];
        for (let i = 0; i < 16; i++) if (this.grid[i] === 0) empties.push(i);
        if (!empties.length) return;
        const i = empties[Math.floor(Math.random() * empties.length)];
        this.grid[i] = Math.random() < 0.9 ? 2 : 4;
    }

    to2D() {
        const g = [];
        for (let r = 0; r < 4; r++) g.push(this.grid.slice(r * 4, r * 4 + 4));
        return g;
    }

    from2D(g) { return g.flat(); }

    // 왼쪽으로 미는 기준의 한 줄 압축+합치기 (다른 방향은 줄 추출 순서로 재사용)
    slideLine(line) {
        const vals = line.filter(v => v !== 0);
        const merged = [];
        let gained = 0;
        for (let i = 0; i < vals.length; i++) {
            if (i < vals.length - 1 && vals[i] === vals[i + 1]) {
                merged.push(vals[i] * 2);
                gained += vals[i] * 2;
                i++;
            } else {
                merged.push(vals[i]);
            }
        }
        while (merged.length < 4) merged.push(0);
        const moved = merged.some((v, i) => v !== line[i]);
        return { line: merged, moved, gained };
    }

    extractLine(g, dir, i) {
        if (dir === 'left') return [g[i][0], g[i][1], g[i][2], g[i][3]];
        if (dir === 'right') return [g[i][3], g[i][2], g[i][1], g[i][0]];
        if (dir === 'up') return [g[0][i], g[1][i], g[2][i], g[3][i]];
        return [g[3][i], g[2][i], g[1][i], g[0][i]]; // down
    }

    writeLine(g, dir, i, arr) {
        if (dir === 'left') { g[i][0] = arr[0]; g[i][1] = arr[1]; g[i][2] = arr[2]; g[i][3] = arr[3]; }
        else if (dir === 'right') { g[i][3] = arr[0]; g[i][2] = arr[1]; g[i][1] = arr[2]; g[i][0] = arr[3]; }
        else if (dir === 'up') { g[0][i] = arr[0]; g[1][i] = arr[1]; g[2][i] = arr[2]; g[3][i] = arr[3]; }
        else { g[3][i] = arr[0]; g[2][i] = arr[1]; g[1][i] = arr[2]; g[0][i] = arr[3]; } // down
    }

    move(dir) {
        if (this.over) return;
        const g = this.to2D();
        let moved = false, gained = 0;
        for (let i = 0; i < 4; i++) {
            const res = this.slideLine(this.extractLine(g, dir, i));
            if (res.moved) moved = true;
            gained += res.gained;
            this.writeLine(g, dir, i, res.line);
        }
        if (!moved) return;
        this.grid = this.from2D(g);
        this.score += gained;
        if (this.score > this.best) {
            this.best = this.score;
            localStorage.setItem(this.BEST_KEY, this.best);
        }
        this.addRandom();
        this.render();
        this.checkWin();
        this.checkOver();
    }

    checkWin() {
        if (this.won || this.continued) return;
        if (this.grid.includes(2048)) {
            this.won = true;
            this.winOverlay.classList.remove('hidden');
        }
    }

    checkOver() {
        if (this.grid.includes(0)) return;
        const g = this.to2D();
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (c < 3 && g[r][c] === g[r][c + 1]) return;
                if (r < 3 && g[r][c] === g[r + 1][c]) return;
            }
        }
        this.over = true;
        this.overDesc.textContent = (this.en ? 'Score: ' : '점수: ') + this.score;
        setTimeout(() => this.overOverlay.classList.remove('hidden'), 300);
    }

    render() {
        const children = this.boardEl.children;
        for (let i = 0; i < 16; i++) {
            const v = this.grid[i];
            const el = children[i];
            el.className = 'g2048-cell';
            if (v) {
                el.textContent = v;
                el.dataset.value = v;
                if (v > 2048) el.classList.add('super');
                if (v >= 1000) el.classList.add('small');
                else if (v >= 100) el.classList.add('mid');
            } else {
                el.textContent = '';
                delete el.dataset.value;
            }
        }
        this.scoreEl.textContent = this.score;
        this.bestEl.textContent = this.best;
    }

    refreshLang() {
        if (this.over) this.overDesc.textContent = (this.en ? 'Score: ' : '점수: ') + this.score;
    }
}

window.g2048Game = new Game2048();
