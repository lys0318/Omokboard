// 틱택토 (Tic-Tac-Toe) — PvP + AI(미니맥스)
class TicTacToe {
    constructor() {
        this.board = Array(9).fill(null);
        this.human = 'X';      // 사람(선공)
        this.ai = 'O';
        this.currentTurn = 'X';
        this.gameMode = 'pvp'; // 'pvp' | 'ai'
        this.difficulty = 'hard';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.winLine = null;

        this.boardEl     = document.getElementById('ttt-board');
        this.statusEl    = document.getElementById('ttt-status');
        this.xLabelEl    = document.getElementById('ttt-x-label');
        this.oLabelEl    = document.getElementById('ttt-o-label');
        this.xPlayerEl   = document.getElementById('ttt-player-x');
        this.oPlayerEl   = document.getElementById('ttt-player-o');
        this.modeOverlay = document.getElementById('ttt-mode-overlay');
        this.winOverlay  = document.getElementById('ttt-win-overlay');
        this.winTitle    = document.getElementById('ttt-win-title');
        this.winDesc     = document.getElementById('ttt-win-desc');

        this.WINS = [
            [0,1,2],[3,4,5],[6,7,8],
            [0,3,6],[1,4,7],[2,5,8],
            [0,4,8],[2,4,6]
        ];

        this.buildBoard();
        this.bindEvents();
    }

    get en() { return window.i18n && window.i18n.getLang() === 'en'; }

    buildBoard() {
        this.boardEl.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('button');
            cell.className = 'ttt-cell';
            cell.dataset.idx = i;
            cell.addEventListener('click', () => this.onCellClick(i));
            this.boardEl.appendChild(cell);
        }
    }

    bindEvents() {
        document.getElementById('ttt-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('ttt-ai-select-btn').addEventListener('click', () => {
            document.getElementById('ttt-step-mode').classList.add('hidden');
            document.getElementById('ttt-step-diff').classList.remove('hidden');
        });
        document.getElementById('ttt-easy-btn').addEventListener('click',   () => this.startGame('ai', 'easy'));
        document.getElementById('ttt-normal-btn').addEventListener('click', () => this.startGame('ai', 'normal'));
        document.getElementById('ttt-hard-btn').addEventListener('click',   () => this.startGame('ai', 'hard'));
        document.getElementById('ttt-diff-back').addEventListener('click', () => {
            document.getElementById('ttt-step-diff').classList.add('hidden');
            document.getElementById('ttt-step-mode').classList.remove('hidden');
        });
        document.getElementById('ttt-reset-btn').addEventListener('click', () => window.tttHub.showVariant());
        document.getElementById('ttt-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            window.tttHub.showVariant();
        });
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('ttt-step-mode').classList.remove('hidden');
        document.getElementById('ttt-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'hard') {
        this.gameMode = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        if (this.oLabelEl) this.oLabelEl.textContent = mode === 'ai' ? (this.en ? 'AI (O)' : 'AI (O)') : 'O';
        this.reset();
    }

    reset() {
        this.board = Array(9).fill(null);
        this.currentTurn = 'X';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.winLine = null;
        this.render();
        this.updateStatus();
    }

    onCellClick(i) {
        if (this.isGameOver || this.isAIThinking) return;
        if (this.board[i]) return;
        if (this.gameMode === 'ai' && this.currentTurn !== this.human) return;
        this.place(i, this.currentTurn);
    }

    place(i, player) {
        this.board[i] = player;
        const line = this.getWinLine(this.board, player);
        if (line) { this.winLine = line; this.render(); this.handleWin(player); return; }
        if (this.board.every(c => c)) { this.render(); this.handleDraw(); return; }
        this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
        this.render();
        this.updateStatus();
        if (this.gameMode === 'ai' && this.currentTurn === this.ai) this.scheduleAI();
    }

    scheduleAI() {
        this.isAIThinking = true;
        this.updateStatus();
        const delay = this.difficulty === 'easy' ? 500 : this.difficulty === 'hard' ? 350 : 420;
        setTimeout(() => {
            if (this.isGameOver) { this.isAIThinking = false; return; }
            const move = this.getAIMove();
            this.isAIThinking = false;
            if (move != null) this.place(move, this.ai);
        }, delay);
    }

    getAIMove() {
        const empty = this.board.map((c, i) => c ? null : i).filter(i => i !== null);
        if (!empty.length) return null;
        if (this.difficulty === 'easy') return empty[Math.floor(Math.random() * empty.length)];
        if (this.difficulty === 'normal' && Math.random() < 0.5) return empty[Math.floor(Math.random() * empty.length)];
        // hard(또는 normal 50%): 완벽한 미니맥스
        let bestScore = -Infinity, bestMove = empty[0];
        for (const i of empty) {
            this.board[i] = this.ai;
            const score = this.minimax(this.board, 0, false);
            this.board[i] = null;
            if (score > bestScore) { bestScore = score; bestMove = i; }
        }
        return bestMove;
    }

    minimax(b, depth, isMax) {
        if (this.getWinLine(b, this.ai)) return 10 - depth;
        if (this.getWinLine(b, this.human)) return depth - 10;
        if (b.every(c => c)) return 0;
        if (isMax) {
            let best = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (b[i]) continue;
                b[i] = this.ai;
                best = Math.max(best, this.minimax(b, depth + 1, false));
                b[i] = null;
            }
            return best;
        } else {
            let best = Infinity;
            for (let i = 0; i < 9; i++) {
                if (b[i]) continue;
                b[i] = this.human;
                best = Math.min(best, this.minimax(b, depth + 1, true));
                b[i] = null;
            }
            return best;
        }
    }

    getWinLine(b, player) {
        for (const line of this.WINS) {
            if (line.every(i => b[i] === player)) return line;
        }
        return null;
    }

    render() {
        const cells = this.boardEl.children;
        for (let i = 0; i < 9; i++) {
            const cell = cells[i];
            const v = this.board[i];
            cell.textContent = v || '';
            cell.classList.toggle('x', v === 'X');
            cell.classList.toggle('o', v === 'O');
            cell.classList.toggle('win', !!(this.winLine && this.winLine.includes(i)));
            cell.disabled = !!v || this.isGameOver;
        }
        this.xPlayerEl.classList.toggle('active', this.currentTurn === 'X' && !this.isGameOver);
        this.oPlayerEl.classList.toggle('active', this.currentTurn === 'O' && !this.isGameOver);
    }

    updateStatus() {
        if (this.isAIThinking) { this.statusEl.textContent = this.en ? 'AI is thinking…' : 'AI가 생각 중…'; return; }
        if (this.gameMode === 'ai') {
            this.statusEl.textContent = this.currentTurn === this.human
                ? (this.en ? 'Your turn (X)' : '당신 차례 (X)')
                : (this.en ? "AI's turn (O)" : 'AI 차례 (O)');
        } else {
            this.statusEl.textContent = this.currentTurn === 'X'
                ? (this.en ? "X's turn" : 'X 차례')
                : (this.en ? "O's turn" : 'O 차례');
        }
    }

    handleWin(player) {
        this.isGameOver = true;
        this.render();
        setTimeout(() => {
            let title, desc;
            if (this.gameMode === 'ai') {
                const win = player === this.human;
                title = win ? (this.en ? 'You Win!' : '승리!') : (this.en ? 'You Lose' : '패배');
                desc  = win ? (this.en ? 'You beat the AI.' : 'AI를 이겼습니다!') : (this.en ? 'The AI won.' : 'AI가 이겼습니다.');
            } else {
                title = this.en ? 'Win!' : '승리!';
                desc  = (this.en ? player + ' wins!' : player + ' 승리!');
            }
            this.winTitle.textContent = title;
            this.winDesc.textContent = desc;
            this.winOverlay.classList.remove('hidden');
        }, 600);
    }

    handleDraw() {
        this.isGameOver = true;
        setTimeout(() => {
            this.winTitle.textContent = this.en ? 'Draw' : '무승부';
            this.winDesc.textContent = this.en ? 'No more moves.' : '더 둘 곳이 없습니다.';
            this.winOverlay.classList.remove('hidden');
        }, 400);
    }

    refreshLang() {
        if (this.oLabelEl) this.oLabelEl.textContent = this.gameMode === 'ai' ? 'AI (O)' : 'O';
        if (!this.isGameOver) this.updateStatus();
    }
}

window.tttGame = new TicTacToe();
