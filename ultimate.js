// 얼티메이트 틱택토 (Ultimate Tic-Tac-Toe) — PvP + AI
// 9개의 작은 3×3 보드. 둔 칸 위치가 상대의 다음 보드를 결정.
// 보낸 보드가 끝났으면 아무 곳이나. 작은 보드 3목으로 그 보드를 차지,
// 큰 보드에서 3개 보드를 한 줄로 차지하면 승리.
const UTTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

class UltimateTTT {
    constructor() {
        this.boards = [];        // 9 × (9 cells)
        this.boardWinner = [];   // 9: null|'X'|'O'|'draw'
        this.bigWinner = null;
        this.current = 'X';
        this.activeBoard = null; // 둬야 할 보드 index, null=아무곳
        this.lastCell = null;
        this.human = 'X'; this.ai = 'O';
        this.gameMode = 'pvp'; this.difficulty = 'hard';
        this.isGameOver = false; this.isAIThinking = false;

        this.boardEl   = document.getElementById('uttt-board');
        this.statusEl  = document.getElementById('uttt-status');
        this.xPlayerEl = document.getElementById('uttt-player-x');
        this.oPlayerEl = document.getElementById('uttt-player-o');
        this.oLabelEl  = document.getElementById('uttt-o-label');
        this.modeOverlay = document.getElementById('uttt-mode-overlay');
        this.winOverlay  = document.getElementById('uttt-win-overlay');
        this.winTitle    = document.getElementById('uttt-win-title');
        this.winDesc     = document.getElementById('uttt-win-desc');

        this.buildBoard();
        this.bindEvents();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }

    buildBoard() {
        this.boardEl.innerHTML = '';
        this.cellEls = [];
        for (let sb = 0; sb < 9; sb++) {
            const sbEl = document.createElement('div');
            sbEl.className = 'uttt-sb';
            sbEl.dataset.sb = sb;
            const cells = [];
            for (let c = 0; c < 9; c++) {
                const cell = document.createElement('button');
                cell.className = 'uttt-cell';
                cell.addEventListener('click', () => this.onCellClick(sb, c));
                sbEl.appendChild(cell);
                cells.push(cell);
            }
            const ov = document.createElement('div');
            ov.className = 'uttt-sb-overlay';
            sbEl.appendChild(ov);
            this.boardEl.appendChild(sbEl);
            this.cellEls.push({ sbEl, cells, ov });
        }
    }

    bindEvents() {
        document.getElementById('uttt-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('uttt-ai-select-btn').addEventListener('click', () => {
            document.getElementById('uttt-step-mode').classList.add('hidden');
            document.getElementById('uttt-step-diff').classList.remove('hidden');
        });
        document.getElementById('uttt-easy-btn').addEventListener('click',   () => this.startGame('ai','easy'));
        document.getElementById('uttt-normal-btn').addEventListener('click', () => this.startGame('ai','normal'));
        document.getElementById('uttt-hard-btn').addEventListener('click',   () => this.startGame('ai','hard'));
        document.getElementById('uttt-diff-back').addEventListener('click', () => {
            document.getElementById('uttt-step-diff').classList.add('hidden');
            document.getElementById('uttt-step-mode').classList.remove('hidden');
        });
        document.getElementById('uttt-reset-btn').addEventListener('click', () => window.tttHub.showVariant());
        document.getElementById('uttt-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden'); window.tttHub.showVariant();
        });
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('uttt-step-mode').classList.remove('hidden');
        document.getElementById('uttt-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'hard') {
        this.gameMode = mode; this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        if (this.oLabelEl) this.oLabelEl.textContent = mode === 'ai' ? 'AI (O)' : 'O';
        this.reset();
    }

    reset() {
        this.boards = Array.from({ length: 9 }, () => Array(9).fill(null));
        this.boardWinner = Array(9).fill(null);
        this.bigWinner = null;
        this.current = 'X';
        this.activeBoard = null;
        this.lastCell = null;
        this.isGameOver = false;
        this.isAIThinking = false;
        this.render();
        this.updateStatus();
    }

    // ─── 규칙 헬퍼 ───────────────────────────────────────────
    winnerOf(cells) {
        for (const [a,b,c] of UTTT_LINES) if (cells[a] && cells[a]===cells[b] && cells[b]===cells[c]) return cells[a];
        return null;
    }
    isFull(cells) { return cells.every(v => v); }

    boardPlayable(sb) { return !this.boardWinner[sb] && !this.isFull(this.boards[sb]); }

    legalMoves() {
        const moves = [];
        const inActive = this.activeBoard != null && this.boardPlayable(this.activeBoard);
        for (let sb = 0; sb < 9; sb++) {
            if (inActive && sb !== this.activeBoard) continue;
            if (!this.boardPlayable(sb)) continue;
            for (let c = 0; c < 9; c++) if (!this.boards[sb][c]) moves.push({ sb, c });
        }
        return moves;
    }

    isLegal(sb, c) {
        if (this.boards[sb][c]) return false;
        if (!this.boardPlayable(sb)) return false;
        if (this.activeBoard != null && this.boardPlayable(this.activeBoard) && sb !== this.activeBoard) return false;
        return true;
    }

    // ─── 진행 ────────────────────────────────────────────────
    onCellClick(sb, c) {
        if (this.isGameOver || this.isAIThinking) return;
        if (this.gameMode === 'ai' && this.current !== this.human) return;
        if (!this.isLegal(sb, c)) return;
        this.play(sb, c, this.current);
    }

    play(sb, c, player) {
        this.boards[sb][c] = player;
        this.lastCell = { sb, c };
        // 작은 보드 승패
        if (!this.boardWinner[sb]) {
            const w = this.winnerOf(this.boards[sb]);
            if (w) this.boardWinner[sb] = w;
            else if (this.isFull(this.boards[sb])) this.boardWinner[sb] = 'draw';
        }
        // 큰 보드 승리
        const big = this.winnerOf(this.boardWinner.map(w => (w==='X'||w==='O') ? w : null));
        if (big) { this.bigWinner = big; this.activeBoard = null; this.render(); this.handleWin(big); return; }
        // 다음 활성 보드
        this.activeBoard = this.boardPlayable(c) ? c : null;
        // 전체 무승부
        if (!this.legalMoves().length) { this.render(); this.handleDraw(); return; }

        this.current = this.current === 'X' ? 'O' : 'X';
        this.render();
        this.updateStatus();
        if (this.gameMode === 'ai' && this.current === this.ai) this.scheduleAI();
    }

    scheduleAI() {
        this.isAIThinking = true;
        this.updateStatus();
        const delay = this.difficulty === 'easy' ? 450 : this.difficulty === 'hard' ? 400 : 420;
        setTimeout(() => {
            if (this.isGameOver) { this.isAIThinking = false; return; }
            const mv = this.getAIMove();
            this.isAIThinking = false;
            if (mv) this.play(mv.sb, mv.c, this.ai);
        }, delay);
    }

    // ─── AI (미니맥스 + 알파베타) ────────────────────────────
    getAIMove() {
        const moves = this.legalMoves();
        if (!moves.length) return null;
        if (this.difficulty === 'easy') return moves[Math.floor(Math.random()*moves.length)];
        if (this.difficulty === 'normal' && Math.random() < 0.25) return moves[Math.floor(Math.random()*moves.length)];

        const depth = this.difficulty === 'hard' ? 6 : 3;
        const state = {
            boards: this.boards.map(b => b.slice()),
            boardWinner: this.boardWinner.slice(),
            activeBoard: this.activeBoard
        };
        const ordered = this.orderMovesState(state, moves, this.ai);
        const inActive = state.activeBoard != null && this.boardPlayableS(state, state.activeBoard);
        const cap = inActive ? ordered.length : Math.min(ordered.length, 12);
        let best = ordered[0], bestScore = -Infinity, alpha = -Infinity;
        for (let i = 0; i < cap; i++) {
            const m = ordered[i];
            const ns = this.applyState(state, m.sb, m.c, this.ai);
            const sc = this.minimax(ns, depth - 1, alpha, Infinity, this.human);
            if (sc > bestScore) { bestScore = sc; best = m; }
            if (sc > alpha) alpha = sc;
        }
        return best;
    }

    BOARD_W = [3,2,3, 2,4,2, 3,2,3];

    bigWinnerOf(bw) { return this.winnerOf(bw.map(w => (w==='X'||w==='O') ? w : null)); }

    boardPlayableS(state, sb) {
        return !state.boardWinner[sb] && !state.boards[sb].every(v => v);
    }

    legalMovesS(state) {
        const moves = [];
        const inActive = state.activeBoard != null && this.boardPlayableS(state, state.activeBoard);
        for (let sb = 0; sb < 9; sb++) {
            if (inActive && sb !== state.activeBoard) continue;
            if (!this.boardPlayableS(state, sb)) continue;
            for (let c = 0; c < 9; c++) if (!state.boards[sb][c]) moves.push({ sb, c });
        }
        return moves;
    }

    applyState(state, sb, c, player) {
        const ns = {
            boards: state.boards.map(b => b.slice()),
            boardWinner: state.boardWinner.slice(),
            activeBoard: null
        };
        ns.boards[sb][c] = player;
        if (!ns.boardWinner[sb]) {
            const w = this.winnerOf(ns.boards[sb]);
            if (w) ns.boardWinner[sb] = w;
            else if (ns.boards[sb].every(v => v)) ns.boardWinner[sb] = 'draw';
        }
        ns.activeBoard = this.boardPlayableS(ns, c) ? c : null;
        return ns;
    }

    minimax(state, depth, alpha, beta, player) {
        const big = this.bigWinnerOf(state.boardWinner);
        if (big === this.ai) return 100000 + depth;
        if (big === this.human) return -100000 - depth;
        const moves = this.legalMovesS(state);
        if (!moves.length) return this.evalState(state);
        if (depth === 0) return this.evalState(state);

        const ordered = this.orderMovesState(state, moves, player);
        const cap = (state.activeBoard != null && this.boardPlayableS(state, state.activeBoard)) ? ordered.length : Math.min(ordered.length, 10);
        if (player === this.ai) {
            let best = -Infinity;
            for (let i = 0; i < cap; i++) {
                const m = ordered[i];
                const v = this.minimax(this.applyState(state, m.sb, m.c, this.ai), depth-1, alpha, beta, this.human);
                if (v > best) best = v;
                if (best > alpha) alpha = best;
                if (alpha >= beta) break;
            }
            return best;
        } else {
            let best = Infinity;
            for (let i = 0; i < cap; i++) {
                const m = ordered[i];
                const v = this.minimax(this.applyState(state, m.sb, m.c, this.human), depth-1, alpha, beta, this.ai);
                if (v < best) best = v;
                if (best < beta) beta = best;
                if (alpha >= beta) break;
            }
            return best;
        }
    }

    orderMovesState(state, moves, player) {
        const opp = player === 'X' ? 'O' : 'X';
        return moves.map(m => {
            let h = 0;
            // 이 수로 작은 보드를 따내는가
            const cells = state.boards[m.sb].slice(); cells[m.c] = player;
            if (!state.boardWinner[m.sb] && this.winnerOf(cells) === player) {
                h += 50 + this.BOARD_W[m.sb] * 4;
                const bw = state.boardWinner.slice(); bw[m.sb] = player;
                if (this.bigWinnerOf(bw) === player) h += 100000;
            }
            h += this.BOARD_W[m.sb] + (m.c === 4 ? 2 : (m.c%2===0 ? 1 : 0));
            // 상대를 끝난 보드로 보내면(자유 이동) 감점
            const target = m.c;
            const targetDone = (target === m.sb)
                ? !!(this.winnerOf(cells) || cells.every(v=>v))
                : (!!state.boardWinner[target] || state.boards[target].every(v=>v));
            if (targetDone) h -= 4;
            return { ...m, h };
        }).sort((a,b) => b.h - a.h);
    }

    evalState(state) {
        const me = this.ai, opp = this.human;
        let score = 0;
        for (let sb = 0; sb < 9; sb++) {
            const w = state.boardWinner[sb];
            if (w === me) score += 10 * this.BOARD_W[sb];
            else if (w === opp) score -= 10 * this.BOARD_W[sb];
            else if (w !== 'draw') {
                score += this.lineScore(state.boards[sb], me) - this.lineScore(state.boards[sb], opp);
            }
        }
        // 큰 보드 줄 잠재력
        const bw = state.boardWinner;
        for (const [a,b,c] of UTTT_LINES) {
            const line = [bw[a],bw[b],bw[c]].map(w => (w==='X'||w==='O') ? w : null);
            const mine = line.filter(v=>v===me).length;
            const them = line.filter(v=>v===opp).length;
            if (them === 0) { if (mine === 2) score += 50; else if (mine === 1) score += 8; }
            else if (mine === 0) { if (them === 2) score -= 50; else if (them === 1) score -= 8; }
        }
        return score;
    }

    lineScore(cells, player) {
        const opp = player === 'X' ? 'O' : 'X';
        let s = 0;
        for (const [a,b,c] of UTTT_LINES) {
            const line = [cells[a],cells[b],cells[c]];
            const mine = line.filter(v=>v===player).length;
            const them = line.filter(v=>v===opp).length;
            if (them===0 && mine===2) s += 3;
            else if (them===0 && mine===1) s += 1;
        }
        return s;
    }

    // ─── 승패 처리 ───────────────────────────────────────────
    handleWin(winner) {
        this.isGameOver = true;
        this.render();
        setTimeout(() => {
            let title, desc;
            if (this.gameMode === 'ai') {
                const win = winner === this.human;
                title = win ? (this.en?'You Win!':'승리!') : (this.en?'You Lose':'패배');
                desc = win ? (this.en?'You won the big board!':'큰 보드를 차지했습니다!') : (this.en?'The AI won.':'AI가 이겼습니다.');
            } else {
                title = (this.en?'Win!':'승리!');
                desc = winner + (this.en?' wins the big board!':' 승리!');
            }
            this.winTitle.textContent = title; this.winDesc.textContent = desc;
            this.winOverlay.classList.remove('hidden');
        }, 500);
    }
    handleDraw() {
        this.isGameOver = true;
        setTimeout(() => {
            this.winTitle.textContent = this.en?'Draw':'무승부';
            this.winDesc.textContent = this.en?'No big-board line.':'큰 보드에 줄이 없습니다.';
            this.winOverlay.classList.remove('hidden');
        }, 400);
    }

    // ─── 렌더 ────────────────────────────────────────────────
    render() {
        const activeSet = new Set();
        if (!this.isGameOver) {
            const inActive = this.activeBoard != null && this.boardPlayable(this.activeBoard);
            if (inActive) activeSet.add(this.activeBoard);
            else for (let sb=0; sb<9; sb++) if (this.boardPlayable(sb)) activeSet.add(sb);
        }
        for (let sb = 0; sb < 9; sb++) {
            const { sbEl, cells, ov } = this.cellEls[sb];
            const w = this.boardWinner[sb];
            sbEl.classList.toggle('won-x', w==='X');
            sbEl.classList.toggle('won-o', w==='O');
            sbEl.classList.toggle('won-draw', w==='draw');
            sbEl.classList.toggle('active-board', activeSet.has(sb));
            ov.textContent = (w==='X'||w==='O') ? w : '';
            for (let c = 0; c < 9; c++) {
                const v = this.boards[sb][c];
                const cell = cells[c];
                cell.textContent = v || '';
                cell.classList.toggle('x', v==='X');
                cell.classList.toggle('o', v==='O');
                const isLast = this.lastCell && this.lastCell.sb===sb && this.lastCell.c===c;
                cell.classList.toggle('last', !!isLast);
                cell.disabled = !!v || this.isGameOver || !activeSet.has(sb) ||
                    (this.gameMode==='ai' && this.current===this.ai);
            }
        }
        this.xPlayerEl.classList.toggle('active', this.current==='X' && !this.isGameOver);
        this.oPlayerEl.classList.toggle('active', this.current==='O' && !this.isGameOver);
    }

    updateStatus() {
        const color = this.current==='X' ? '#fca5a5' : '#93c5fd';
        this.statusEl.style.color = this.isGameOver ? '' : color;
        if (this.isAIThinking) { this.statusEl.textContent = this.en?'AI is thinking…':'AI가 생각 중…'; return; }
        const free = this.activeBoard == null || !this.boardPlayable(this.activeBoard);
        let turn;
        if (this.gameMode === 'ai') turn = this.current===this.human ? (this.en?'Your turn':'당신 차례') : (this.en?"AI's turn":'AI 차례');
        else turn = (this.current) + (this.en?"'s turn":' 차례');
        this.statusEl.textContent = turn + (free ? (this.en?' · play anywhere':' · 아무 보드나') : (this.en?' · play in the glowing board':' · 빛나는 보드에'));
    }

    refreshLang() {
        if (this.oLabelEl) this.oLabelEl.textContent = this.gameMode==='ai' ? 'AI (O)' : 'O';
        if (!this.isGameOver) this.updateStatus();
    }
}

window.uttGame = new UltimateTTT();
