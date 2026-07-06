// 지뢰찾기 (Minesweeper) — 1인, 3단계 난이도, 첫 클릭 안전
class Minesweeper {
    constructor() {
        this.DIFF = {
            easy:   { n: 9,  mines: 10 },
            normal: { n: 12, mines: 20 },
            hard:   { n: 16, mines: 40 },
        };
        this.n = 9;
        this.mines = 10;
        this.cells = [];      // { mine, open, flag, adj }
        this.firstClick = true;
        this.isGameOver = false;
        this.flagMode = false;
        this.timer = 0;
        this.timerId = null;

        this.boardEl = document.getElementById('mine-board');
        this.statusEl = document.getElementById('mine-status');
        this.countEl = document.getElementById('mine-count');
        this.modeOverlay = document.getElementById('mine-mode-overlay');
        this.winOverlay = document.getElementById('mine-win-overlay');
        this.winTitle = document.getElementById('mine-win-title');
        this.winDesc = document.getElementById('mine-win-desc');
        this.flagBtn = document.getElementById('mine-flag-toggle');

        this.bindEvents();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }

    bindEvents() {
        document.getElementById('mine-easy-btn').addEventListener('click', () => this.startGame('easy'));
        document.getElementById('mine-normal-btn').addEventListener('click', () => this.startGame('normal'));
        document.getElementById('mine-hard-btn').addEventListener('click', () => this.startGame('hard'));
        document.getElementById('mine-reset-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('mine-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
        this.flagBtn.addEventListener('click', () => {
            this.flagMode = !this.flagMode;
            this.flagBtn.classList.toggle('active', this.flagMode);
        });
    }

    showModeScreen() {
        clearInterval(this.timerId);
        this.modeOverlay.classList.remove('hidden');
    }

    startGame(difficulty) {
        const d = this.DIFF[difficulty];
        this.n = d.n;
        this.mines = d.mines;
        this.modeOverlay.classList.add('hidden');
        this.cells = Array.from({ length: this.n * this.n }, () => ({ mine: false, open: false, flag: false, adj: 0 }));
        this.firstClick = true;
        this.isGameOver = false;
        this.flagMode = false;
        this.flagBtn.classList.remove('active');
        clearInterval(this.timerId);
        this.timer = 0;
        const fs = this.n <= 9 ? '1.3rem' : this.n <= 12 ? '1.05rem' : '0.85rem';
        this.boardEl.style.setProperty('--n', this.n);
        this.boardEl.style.setProperty('--fs', fs);
        this.buildBoard();
        this.updateStatus();
    }

    buildBoard() {
        this.boardEl.innerHTML = '';
        for (let i = 0; i < this.n * this.n; i++) {
            const c = document.createElement('button');
            c.className = 'mine-cell';
            c.addEventListener('click', () => this.handleClick(i));
            c.addEventListener('contextmenu', (e) => { e.preventDefault(); this.toggleFlag(i); });
            this.boardEl.appendChild(c);
        }
    }

    idx(r, c) { return r * this.n + c; }
    rc(i) { return [Math.floor(i / this.n), i % this.n]; }

    neighbors(i) {
        const [r, c] = this.rc(i);
        const out = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < this.n && nc >= 0 && nc < this.n) out.push(this.idx(nr, nc));
            }
        }
        return out;
    }

    placeMines(excludeIdx) {
        const exclude = new Set([excludeIdx, ...this.neighbors(excludeIdx)]);
        const pool = [];
        for (let i = 0; i < this.cells.length; i++) if (!exclude.has(i)) pool.push(i);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        for (let k = 0; k < this.mines; k++) this.cells[pool[k]].mine = true;
        this.cells.forEach((cell, i) => {
            if (cell.mine) return;
            cell.adj = this.neighbors(i).filter(j => this.cells[j].mine).length;
        });
    }

    handleClick(i) {
        if (this.isGameOver) return;
        const cell = this.cells[i];
        if (cell.open) return;
        if (this.flagMode) { this.toggleFlag(i); return; }
        if (cell.flag) return;

        if (this.firstClick) {
            this.placeMines(i);
            this.firstClick = false;
            this.timerId = setInterval(() => { this.timer++; this.updateStatus(); }, 1000);
        }

        if (cell.mine) {
            cell.open = true;
            this.render();
            this.gameOver(false, i);
            return;
        }
        this.floodOpen(i);
        this.render();
        this.checkWin();
    }

    floodOpen(start) {
        const stack = [start];
        while (stack.length) {
            const i = stack.pop();
            const cell = this.cells[i];
            if (cell.open || cell.flag) continue;
            cell.open = true;
            if (cell.adj === 0) {
                for (const j of this.neighbors(i)) if (!this.cells[j].open) stack.push(j);
            }
        }
    }

    toggleFlag(i) {
        if (this.isGameOver || this.firstClick) return;
        const cell = this.cells[i];
        if (cell.open) return;
        cell.flag = !cell.flag;
        this.render();
        this.updateStatus();
    }

    checkWin() {
        const safeTotal = this.cells.length - this.mines;
        const openCount = this.cells.filter(c => c.open).length;
        if (openCount < safeTotal) return;
        this.isGameOver = true;
        clearInterval(this.timerId);
        this.cells.forEach(c => { if (c.mine) c.flag = true; });
        this.render();
        setTimeout(() => {
            this.winTitle.textContent = this.en ? 'You Win!' : '승리!';
            this.winDesc.textContent = (this.en ? 'Time: ' : '기록: ') + this.fmtTime(this.timer);
            this.winOverlay.classList.remove('hidden');
        }, 200);
    }

    gameOver(win, boomIdx) {
        this.isGameOver = true;
        clearInterval(this.timerId);
        this.cells.forEach(c => { if (c.mine) c.open = true; });
        if (boomIdx != null) this.cells[boomIdx].boom = true;
        this.render();
        setTimeout(() => {
            this.winTitle.textContent = this.en ? 'Boom!' : '펑!';
            this.winDesc.textContent = this.en ? 'You hit a mine.' : '지뢰를 밟았습니다.';
            this.winOverlay.classList.remove('hidden');
        }, 200);
    }

    fmtTime(s) {
        const m = Math.floor(s / 60), sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    render() {
        const children = this.boardEl.children;
        for (let i = 0; i < this.cells.length; i++) {
            const cell = this.cells[i];
            const el = children[i];
            el.className = 'mine-cell';
            if (cell.open) {
                el.classList.add('open');
                if (cell.mine) {
                    el.classList.add('mine');
                    if (cell.boom) el.classList.add('boom');
                    el.textContent = '💣';
                } else {
                    el.textContent = cell.adj || '';
                    if (cell.adj > 0) el.classList.add('n' + cell.adj);
                }
            } else {
                el.textContent = cell.flag ? '🚩' : '';
            }
        }
    }

    updateStatus() {
        this.statusEl.textContent = '⏱ ' + this.fmtTime(this.timer);
        const flagged = this.cells.filter(c => c.flag).length;
        this.countEl.textContent = '💣 ' + (this.mines - flagged);
    }

    refreshLang() {
        if (!this.isGameOver) this.updateStatus();
    }
}

window.mineGame = new Minesweeper();
