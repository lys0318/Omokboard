// 스도쿠 (Sudoku) — 1인 모드 + 대결 모드(1:1 / AI)
class Sudoku {
    constructor() {
        this.solution = [];   // 81개 정답 (1-9)
        this.given = [];      // 81개 bool — 처음부터 주어진 칸(잠금)
        this.cells = [];      // 81개 현재 값 (0 = 빈칸)
        this.owner = [];      // 대결: null | 'p1' | 'p2'
        this.selected = null;
        this.mode = 'solo';   // 'solo' | 'duel'
        this.vsAI = false;
        this.current = 'p1';
        this.scores = { p1: 0, p2: 0 };
        this.difficulty = 'normal';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.timer = 0;
        this.timerId = null;

        this.boardEl   = document.getElementById('sudoku-board');
        this.padEl     = document.getElementById('sudoku-pad');
        this.statusEl  = document.getElementById('sudoku-status');
        this.infoEl    = document.getElementById('sudoku-info');
        this.modeOverlay = document.getElementById('sudoku-mode-overlay');
        this.winOverlay  = document.getElementById('sudoku-win-overlay');
        this.winTitle    = document.getElementById('sudoku-win-title');
        this.winDesc     = document.getElementById('sudoku-win-desc');

        this.buildBoard();
        this.buildPad();
        this.bindEvents();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }

    buildBoard() {
        this.boardEl.innerHTML = '';
        for (let i = 0; i < 81; i++) {
            const c = document.createElement('button');
            c.className = 'sudoku-cell';
            const r = Math.floor(i / 9), col = i % 9;
            if (col % 3 === 2 && col !== 8) c.classList.add('br');
            if (r % 3 === 2 && r !== 8) c.classList.add('bb');
            c.dataset.idx = i;
            c.addEventListener('click', () => this.selectCell(i));
            this.boardEl.appendChild(c);
        }
    }

    buildPad() {
        this.padEl.innerHTML = '';
        for (let n = 1; n <= 9; n++) {
            const b = document.createElement('button');
            b.className = 'sudoku-num';
            b.textContent = n;
            b.addEventListener('click', () => this.inputNumber(n));
            this.padEl.appendChild(b);
        }
        const er = document.createElement('button');
        er.className = 'sudoku-num erase';
        er.textContent = '⌫';
        er.addEventListener('click', () => this.inputNumber(0));
        this.padEl.appendChild(er);
    }

    bindEvents() {
        document.getElementById('sudoku-solo-btn').addEventListener('click', () => this.chooseMode('solo', false));
        document.getElementById('sudoku-pvp-btn').addEventListener('click', () => this.chooseMode('duel', false));
        document.getElementById('sudoku-ai-btn').addEventListener('click', () => this.chooseMode('duel', true));
        document.getElementById('sudoku-easy-btn').addEventListener('click',   () => this.startGame('easy'));
        document.getElementById('sudoku-normal-btn').addEventListener('click', () => this.startGame('normal'));
        document.getElementById('sudoku-hard-btn').addEventListener('click',   () => this.startGame('hard'));
        document.getElementById('sudoku-diff-back').addEventListener('click', () => {
            document.getElementById('sudoku-step-diff').classList.add('hidden');
            document.getElementById('sudoku-step-mode').classList.remove('hidden');
        });
        document.getElementById('sudoku-reset-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('sudoku-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
        document.addEventListener('keydown', (e) => {
            if (this.modeOverlay && !this.modeOverlay.classList.contains('hidden')) return;
            if (e.key >= '1' && e.key <= '9') this.inputNumber(parseInt(e.key));
            else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') this.inputNumber(0);
        });
    }

    showModeScreen() {
        clearInterval(this.timerId);
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('sudoku-step-mode').classList.remove('hidden');
        document.getElementById('sudoku-step-diff').classList.add('hidden');
    }

    chooseMode(mode, vsAI) {
        this.mode = mode;
        this.vsAI = vsAI;
        document.getElementById('sudoku-step-mode').classList.add('hidden');
        document.getElementById('sudoku-step-diff').classList.remove('hidden');
    }

    startGame(difficulty) {
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        this.newPuzzle(difficulty);
        this.selected = null;
        this.isGameOver = false;
        this.isAIThinking = false;
        this.current = 'p1';
        this.scores = { p1: 0, p2: 0 };
        clearInterval(this.timerId);
        this.timer = 0;
        if (this.mode === 'solo') {
            this.timerId = setInterval(() => { this.timer++; this.updateStatus(); }, 1000);
        }
        this.render();
        this.updateStatus();
    }

    // ─── 퍼즐 생성 ────────────────────────────────────────────
    newPuzzle(difficulty) {
        this.solution = this.generateSolved();
        const givensTarget = difficulty === 'easy' ? 45 : difficulty === 'hard' ? 30 : 36;
        const puzzle = this.digHoles(this.solution, givensTarget);
        this.cells = puzzle.slice();
        this.given = puzzle.map(v => v !== 0);
        this.owner = Array(81).fill(null);
    }

    generateSolved() {
        const b = Array(81).fill(0);
        this.fillGrid(b);
        return b;
    }

    fillGrid(b) {
        for (let i = 0; i < 81; i++) {
            if (b[i] !== 0) continue;
            const nums = this.shuffle([1,2,3,4,5,6,7,8,9]);
            for (const n of nums) {
                if (this.canPlace(b, i, n)) {
                    b[i] = n;
                    if (this.fillGrid(b)) return true;
                    b[i] = 0;
                }
            }
            return false;
        }
        return true;
    }

    canPlace(b, idx, n) {
        const r = Math.floor(idx / 9), c = idx % 9;
        for (let k = 0; k < 9; k++) {
            if (b[r*9 + k] === n) return false;
            if (b[k*9 + c] === n) return false;
        }
        const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
        for (let dr = 0; dr < 3; dr++)
            for (let dc = 0; dc < 3; dc++)
                if (b[(br+dr)*9 + (bc+dc)] === n) return false;
        return true;
    }

    digHoles(solution, givensTarget) {
        const puzzle = solution.slice();
        const order = this.shuffle([...Array(81).keys()]);
        let givens = 81;
        for (const idx of order) {
            if (givens <= givensTarget) break;
            const backup = puzzle[idx];
            puzzle[idx] = 0;
            // 유일해 유지 확인 (해가 정확히 1개)
            if (this.countSolutions(puzzle.slice(), 2) !== 1) {
                puzzle[idx] = backup; // 되돌림
            } else {
                givens--;
            }
        }
        return puzzle;
    }

    countSolutions(b, limit) {
        let i = b.indexOf(0);
        if (i === -1) return 1;
        let count = 0;
        for (let n = 1; n <= 9; n++) {
            if (this.canPlace(b, i, n)) {
                b[i] = n;
                count += this.countSolutions(b, limit);
                b[i] = 0;
                if (count >= limit) return count;
            }
        }
        return count;
    }

    shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ─── 입력 ────────────────────────────────────────────────
    selectCell(i) {
        if (this.isGameOver || this.isAIThinking) return;
        if (this.given[i]) { this.selected = null; this.render(); return; }
        if (this.mode === 'duel' && this.owner[i]) return; // 이미 차지된 칸
        this.selected = i;
        this.render();
    }

    inputNumber(n) {
        if (this.isGameOver || this.isAIThinking) return;
        if (this.selected == null) return;
        const i = this.selected;
        if (this.given[i]) return;

        if (this.mode === 'solo') {
            this.cells[i] = n; // 0 = 지우기
            this.render();
            this.checkSoloWin();
        } else {
            if (n === 0 || this.owner[i]) return;
            if (n === this.solution[i]) {
                this.cells[i] = n;
                this.owner[i] = this.current;
                this.scores[this.current]++;
                this.selected = null;
                this.render();
                if (this.checkDuelEnd()) return;
                this.current = this.current === 'p1' ? 'p2' : 'p1';
                this.updateStatus();
                if (this.vsAI && this.current === 'p2') this.scheduleAI();
            } else {
                // 오답 — 잠깐 표시 후 턴 넘김
                this.flashWrong(i);
                this.selected = null;
                this.current = this.current === 'p1' ? 'p2' : 'p1';
                this.updateStatus();
                if (this.vsAI && this.current === 'p2') this.scheduleAI();
            }
        }
    }

    flashWrong(i) {
        const cell = this.boardEl.children[i];
        cell.classList.add('wrong-flash');
        setTimeout(() => cell.classList.remove('wrong-flash'), 500);
    }

    // ─── 대결 AI ─────────────────────────────────────────────
    scheduleAI() {
        this.isAIThinking = true;
        this.updateStatus();
        setTimeout(() => {
            if (this.isGameOver) { this.isAIThinking = false; return; }
            const empties = [];
            for (let i = 0; i < 81; i++) if (!this.given[i] && !this.owner[i]) empties.push(i);
            if (!empties.length) { this.isAIThinking = false; return; }
            const i = empties[Math.floor(Math.random() * empties.length)];
            const p = this.difficulty === 'easy' ? 0.5 : this.difficulty === 'hard' ? 0.95 : 0.78;
            const correct = Math.random() < p;
            this.isAIThinking = false;
            if (correct) {
                this.cells[i] = this.solution[i];
                this.owner[i] = 'p2';
                this.scores.p2++;
                this.render();
                if (this.checkDuelEnd()) return;
                this.current = 'p1';
                this.updateStatus();
            } else {
                this.flashWrong(i);
                this.current = 'p1';
                this.updateStatus();
            }
        }, 600);
    }

    // ─── 승패 ────────────────────────────────────────────────
    checkSoloWin() {
        for (let i = 0; i < 81; i++) if (this.cells[i] !== this.solution[i]) return;
        this.isGameOver = true;
        clearInterval(this.timerId);
        setTimeout(() => {
            this.winTitle.textContent = this.en ? 'Solved!' : '완성!';
            this.winDesc.textContent = (this.en ? 'Time: ' : '기록: ') + this.fmtTime(this.timer);
            this.winOverlay.classList.remove('hidden');
        }, 300);
    }

    checkDuelEnd() {
        for (let i = 0; i < 81; i++) if (!this.given[i] && !this.owner[i]) return false;
        this.isGameOver = true;
        setTimeout(() => {
            const { p1, p2 } = this.scores;
            let title, desc;
            const p2name = this.vsAI ? 'AI' : (this.en ? 'Player 2' : '플레이어 2');
            const p1name = this.vsAI ? (this.en ? 'You' : '당신') : (this.en ? 'Player 1' : '플레이어 1');
            if (p1 === p2) { title = this.en ? 'Draw' : '무승부'; }
            else {
                const winner = p1 > p2 ? p1name : p2name;
                if (this.vsAI) title = (p1 > p2) ? (this.en ? 'You Win!' : '승리!') : (this.en ? 'You Lose' : '패배');
                else title = winner + (this.en ? ' Wins!' : ' 승리!');
            }
            desc = `${p1name} ${p1} : ${p2} ${p2name}`;
            this.winTitle.textContent = title;
            this.winDesc.textContent = desc;
            this.winOverlay.classList.remove('hidden');
        }, 300);
        return true;
    }

    fmtTime(s) {
        const m = Math.floor(s / 60), sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    // ─── 렌더 ────────────────────────────────────────────────
    render() {
        const cells = this.boardEl.children;
        for (let i = 0; i < 81; i++) {
            const cell = cells[i];
            const v = this.cells[i];
            cell.textContent = v ? v : '';
            cell.classList.toggle('given', this.given[i]);
            cell.classList.toggle('selected', this.selected === i);
            cell.classList.toggle('p1', this.owner[i] === 'p1');
            cell.classList.toggle('p2', this.owner[i] === 'p2');
            cell.classList.remove('wrong');
            if (this.mode === 'solo' && v && !this.given[i] && v !== this.solution[i]) {
                cell.classList.add('wrong');
            }
            // 같은 숫자 강조
            const selVal = this.selected != null ? this.cells[this.selected] : 0;
            cell.classList.toggle('same', !!(selVal && v === selVal));
        }
    }

    updateStatus() {
        if (this.mode === 'solo') {
            this.infoEl.textContent = '';
            this.statusEl.textContent = (this.en ? 'Time ' : '시간 ') + this.fmtTime(this.timer);
            return;
        }
        // duel
        const p2name = this.vsAI ? 'AI' : (this.en ? 'P2' : 'P2');
        const p1name = this.vsAI ? (this.en ? 'You' : '나') : 'P1';
        this.infoEl.innerHTML = `<span class="sc sc-p1">${p1name} ${this.scores.p1}</span> : <span class="sc sc-p2">${this.scores.p2} ${p2name}</span>`;
        if (this.isAIThinking) { this.statusEl.textContent = this.en ? 'AI is thinking…' : 'AI가 생각 중…'; return; }
        if (this.current === 'p1') this.statusEl.textContent = this.vsAI ? (this.en ? 'Your turn' : '당신 차례') : (this.en ? "P1's turn" : 'P1 차례');
        else this.statusEl.textContent = this.vsAI ? (this.en ? "AI's turn" : 'AI 차례') : (this.en ? "P2's turn" : 'P2 차례');
    }

    refreshLang() {
        if (!this.isGameOver) this.updateStatus();
    }
}

window.sudokuGame = new Sudoku();
