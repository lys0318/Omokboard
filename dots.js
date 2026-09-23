class DotsGame {
    constructor() {
        this.DOTS = 6;
        this.BOXES = this.DOTS - 1;
        this.turnColor = 'red';
        this.gameMode = 'pvp';
        this.difficulty = 'normal';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.hoverLine = null;
        this.inputLocked = false; // 온라인 대전: 내 차례가 아니면 true
        this.hooks = {};
        this.onGameOver = null; // 온라인 대전: 대국 종료를 알리는 훅

        this.canvas = document.getElementById('dots-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.statusEl = document.getElementById('dots-status');
        this.redScoreEl = document.getElementById('dots-red-score');
        this.blueScoreEl = document.getElementById('dots-blue-score');
        this.redPlayerEl = document.getElementById('dots-player-red');
        this.bluePlayerEl = document.getElementById('dots-player-blue');
        this.blueLabelEl = document.getElementById('dots-blue-label');
        this.modeOverlay = document.getElementById('dots-mode-overlay');
        this.winOverlay = document.getElementById('dots-win-overlay');
        this.winTitle = document.getElementById('dots-win-title');
        this.winDesc = document.getElementById('dots-win-desc');

        this.reset();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindEvents();
    }

    emptyLines() {
        return {
            h: Array.from({ length: this.DOTS }, () => Array(this.DOTS - 1).fill(null)),
            v: Array.from({ length: this.DOTS - 1 }, () => Array(this.DOTS).fill(null))
        };
    }

    emptyBoxes() {
        return Array.from({ length: this.BOXES }, () => Array(this.BOXES).fill(null));
    }

    reset() {
        const lines = this.emptyLines();
        this.hLines = lines.h;
        this.vLines = lines.v;
        this.boxes = this.emptyBoxes();
        this.scores = { red: 0, blue: 0 };
        this.turnColor = 'red';
        this.isGameOver = false;
        this.isAIThinking = false;
        this.hoverLine = null;
        this.updateUI();
        if (this.ctx && this.W) this.draw();
    }

    resize() {
        const maxW = Math.min(window.innerWidth - 32, 540);
        this.W = Math.max(300, maxW);
        this.H = this.W;
        this.canvas.width = this.W;
        this.canvas.height = this.H;
        this.draw();
    }

    get boardPad() {
        return Math.max(34, Math.floor(this.W * 0.1));
    }

    get cellSize() {
        return (this.W - this.boardPad * 2) / (this.DOTS - 1);
    }

    bindEvents() {
        const handleMove = (e) => {
            if (!this.canHumanMove()) return;
            this.hoverLine = this.getLineAt(this.getPos(e));
            this.draw();
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!this.canHumanMove()) return;
            const line = this.getLineAt(this.getPos(e));
            if (line) this.placeLine(line);
        });

        this.canvas.addEventListener('pointermove', handleMove);
        this.canvas.addEventListener('pointerleave', () => {
            this.hoverLine = null;
            this.draw();
        });

        document.getElementById('dots-pvp-btn').addEventListener('click', () => this.startGame('pvp'));
        document.getElementById('dots-ai-select-btn').addEventListener('click', () => {
            document.getElementById('dots-step-mode').classList.add('hidden');
            document.getElementById('dots-step-diff').classList.remove('hidden');
        });
        document.getElementById('dots-online-select-btn').addEventListener('click', () => {
            document.getElementById('dots-step-mode').classList.add('hidden');
            document.getElementById('dots-step-online').classList.remove('hidden');
        });
        document.getElementById('dots-easy-btn').addEventListener('click', () => this.startGame('ai', 'easy'));
        document.getElementById('dots-normal-btn').addEventListener('click', () => this.startGame('ai', 'normal'));
        document.getElementById('dots-hard-btn').addEventListener('click', () => this.startGame('ai', 'hard'));
        document.getElementById('dots-diff-back').addEventListener('click', () => {
            document.getElementById('dots-step-diff').classList.add('hidden');
            document.getElementById('dots-step-mode').classList.remove('hidden');
        });
        document.getElementById('dots-restart-btn').addEventListener('click', () => this.showModeScreen());
        document.getElementById('dots-modal-reset').addEventListener('click', () => {
            this.winOverlay.classList.add('hidden');
            this.showModeScreen();
        });
    }

    canHumanMove() {
        if (this.isGameOver || this.isAIThinking) return false;
        if (this.gameMode === 'online' && this.inputLocked) return false;
        return !(this.gameMode === 'ai' && this.turnColor === 'blue');
    }

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const src = e.touches && e.touches.length
            ? e.touches[0]
            : (e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e);
        return {
            x: (src.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (src.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    showModeScreen() {
        this.modeOverlay.classList.remove('hidden');
        document.getElementById('dots-step-mode').classList.remove('hidden');
        document.getElementById('dots-step-diff').classList.add('hidden');
    }

    startGame(mode, difficulty = 'normal') {
        this.gameMode = mode;
        this.difficulty = difficulty;
        this.modeOverlay.classList.add('hidden');
        this.blueLabelEl.textContent = mode === 'ai' ? window.i18n.t('dots.ai.blue') : window.i18n.t('dots.blue');
        this.reset();
    }

    point(row, col) {
        return {
            x: this.boardPad + col * this.cellSize,
            y: this.boardPad + row * this.cellSize
        };
    }

    isLineTaken(line, hLines = this.hLines, vLines = this.vLines) {
        return line.type === 'h' ? !!hLines[line.r][line.c] : !!vLines[line.r][line.c];
    }

    setLine(line, player, hLines = this.hLines, vLines = this.vLines) {
        if (line.type === 'h') hLines[line.r][line.c] = player;
        else vLines[line.r][line.c] = player;
    }

    getLineAt(pos) {
        const candidates = [];
        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS - 1; c++) {
                candidates.push({ type: 'h', r, c });
            }
        }
        for (let r = 0; r < this.DOTS - 1; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                candidates.push({ type: 'v', r, c });
            }
        }

        let best = null;
        let bestDist = Infinity;
        for (const line of candidates) {
            if (this.isLineTaken(line)) continue;
            const dist = this.distanceToLine(pos, line);
            if (dist < bestDist) {
                bestDist = dist;
                best = line;
            }
        }

        return bestDist <= this.cellSize * 0.24 ? best : null;
    }

    distanceToLine(pos, line) {
        const a = this.point(line.r, line.c);
        const b = line.type === 'h' ? this.point(line.r, line.c + 1) : this.point(line.r + 1, line.c);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / lenSq));
        const x = a.x + t * dx;
        const y = a.y + t * dy;
        return Math.hypot(pos.x - x, pos.y - y);
    }

    adjacentBoxes(line) {
        const boxes = [];
        if (line.type === 'h') {
            if (line.r > 0) boxes.push({ r: line.r - 1, c: line.c });
            if (line.r < this.BOXES) boxes.push({ r: line.r, c: line.c });
        } else {
            if (line.c > 0) boxes.push({ r: line.r, c: line.c - 1 });
            if (line.c < this.BOXES) boxes.push({ r: line.r, c: line.c });
        }
        return boxes;
    }

    countBoxSides(row, col, hLines = this.hLines, vLines = this.vLines) {
        let sides = 0;
        if (hLines[row][col]) sides++;
        if (hLines[row + 1][col]) sides++;
        if (vLines[row][col]) sides++;
        if (vLines[row][col + 1]) sides++;
        return sides;
    }

    placeLine(line, opts) {
        if (!line || this.isLineTaken(line) || this.isGameOver) return false;

        this.setLine(line, this.turnColor);
        const completed = [];
        for (const box of this.adjacentBoxes(line)) {
            if (!this.boxes[box.r][box.c] && this.countBoxSides(box.r, box.c) === 4) {
                this.boxes[box.r][box.c] = this.turnColor;
                completed.push(box);
            }
        }

        if (completed.length) {
            this.scores[this.turnColor] += completed.length;
        } else {
            this.turnColor = this.turnColor === 'red' ? 'blue' : 'red';
        }

        this.hoverLine = null;

        // 온라인 대전: 박스를 완성하면 같은 사람이 다시 두므로 다음 턴이 자동
        // 반전이 아닐 수 있다. 실제로 확정된 turnColor를 서버에 명시적으로 알린다.
        if (!opts?.remote && this.hooks.afterMove) {
            this.hooks.afterMove({ line, nextTurn: this.currentTurn });
        }

        if (this.isBoardFull()) {
            this.handleGameOver();
            return true;
        }

        this.updateUI();
        this.draw();
        if (this.gameMode === 'ai' && this.turnColor === 'blue') this.scheduleAI();
        return true;
    }

    isBoardFull() {
        return this.scores.red + this.scores.blue === this.BOXES * this.BOXES;
    }

    getAvailableMoves(hLines = this.hLines, vLines = this.vLines) {
        const moves = [];
        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS - 1; c++) {
                if (!hLines[r][c]) moves.push({ type: 'h', r, c });
            }
        }
        for (let r = 0; r < this.DOTS - 1; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                if (!vLines[r][c]) moves.push({ type: 'v', r, c });
            }
        }
        return moves;
    }

    scheduleAI() {
        this.isAIThinking = true;
        this.updateUI();
        const delay = this.difficulty === 'easy' ? 650 : this.difficulty === 'hard' ? 260 : 430;
        setTimeout(() => {
            if (this.isGameOver) {
                this.isAIThinking = false;
                return;
            }
            const move = this.getBestMove();
            this.isAIThinking = false;
            if (move) this.placeLine(move);
        }, delay);
    }

    getBestMove() {
        const moves = this.getAvailableMoves();
        if (!moves.length) return null;
        if (this.difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];
        if (this.difficulty === 'hard') {
            const endgame = this.endgameMove(moves);
            if (endgame) return endgame;
        }

        const scored = moves.map(move => ({ ...move, score: this.scoreMove(move) }))
            .sort((a, b) => b.score - a.score);

        if (this.difficulty === 'normal') {
            const pool = scored.slice(0, Math.min(4, scored.length));
            return pool[Math.floor(Math.random() * pool.length)];
        }
        return scored[0];
    }

    // ─── 어려움 AI: 끝내기 체인 계산 ─────────────────────────────
    // 안전한 수(세 번째 변을 안 만드는 수)가 남아 있으면 null을 돌려 기존 점수 방식에 맡긴다.
    // 안전한 수가 떨어지면 남은 칸들은 체인(양 끝이 판 바깥)과 고리로 나뉘는데, 이때
    // 어떤 걸 먼저 열어줄지, 먹는 중인 줄의 마지막 칸을 넘겨줄지(더블 크로스)를 표준 체인 계산으로 정한다.
    // ponytail: 갈림길(변이 3~4개 빈 칸)이 섞인 모양은 계산하지 않고 기존 방식으로 둔다.
    endgameMove(moves) {
        const open3 = b => !this.boxes[b.r][b.c] && this.countBoxSides(b.r, b.c) === 3;
        const completes = m => this.adjacentBoxes(m).some(open3);
        const third = m => this.adjacentBoxes(m).some(b => !this.boxes[b.r][b.c] && this.countBoxSides(b.r, b.c) === 2);
        const captures = moves.filter(completes);
        const hasSafe = moves.some(m => !completes(m) && !third(m));
        const key = b => b.r * this.BOXES + b.c;
        const memo = new Map();

        if (captures.length) {
            if (hasSafe) return captures[0]; // 먹고 나서도 안전한 수가 있으니 공짜로 먹는다
            for (const m of captures) {
                const { seg, bothEnds } = this.traceCapture(this.adjacentBoxes(m).find(open3));
                const give = bothEnds ? 4 : 2; // 한쪽 끝 체인은 마지막 2칸, 양쪽 끝(열린 고리 등)은 마지막 4칸을 넘긴다
                if (seg.length !== give) continue;
                const rest = this.chainsAndLoops(new Set(seg.map(key)));
                if (!rest) continue;
                const f = this.openerValue(rest, memo);
                // 다 먹으면 내가 나머지를 열어야 하고(give + f), 넘겨주면 상대가 연다(-give - f)
                if (-give - f > give + f) return this.doubleDealLine(seg, bothEnds);
            }
            return captures[0];
        }
        if (hasSafe) return null;

        const comps = this.chainsAndLoops(new Set());
        if (!comps || !comps.length) return null;
        let best = null, bestV = -Infinity;
        comps.forEach((c, i) => {
            const v = this.openValue(c, this.openerValue(comps.filter((_, j) => j !== i), memo));
            if (v > bestV) { bestV = v; best = c; }
        });
        return this.openingLine(best);
    }

    // 칸의 네 변: [선, 그 변 너머의 칸(판 바깥이면 null)]
    boxEdges(r, c) {
        const B = this.BOXES;
        return [
            [{ type: 'h', r, c }, r > 0 ? { r: r - 1, c } : null],
            [{ type: 'h', r: r + 1, c }, r < B - 1 ? { r: r + 1, c } : null],
            [{ type: 'v', r, c }, c > 0 ? { r, c: c - 1 } : null],
            [{ type: 'v', r, c: c + 1 }, c < B - 1 ? { r, c: c + 1 } : null]
        ];
    }

    openEdges(r, c) {
        return this.boxEdges(r, c).filter(([line]) => !this.isLineTaken(line));
    }

    // 먹을 수 있는 칸 a에서 빈 변을 따라 이어진 칸들. bothEnds: 반대쪽 끝도 바로 먹을 수 있는 칸인지
    traceCapture(a) {
        const B = this.BOXES, seg = [a], seen = new Set([a.r * B + a.c]);
        for (let cur = a; ;) {
            const next = this.openEdges(cur.r, cur.c).map(([, nb]) => nb).find(nb => nb && !seen.has(nb.r * B + nb.c));
            if (!next) return { seg, bothEnds: false };
            const deg = this.openEdges(next.r, next.c).length;
            if (deg > 2) return { seg, bothEnds: false }; // 갈림길 앞에서 멈춘다
            seg.push(next); seen.add(next.r * B + next.c);
            if (deg === 1) return { seg, bothEnds: true };
            cur = next;
        }
    }

    // skip에 없는 남은 칸들을 체인·고리로 나눈다. 모든 칸의 빈 변이 정확히 2개가 아니면 null(계산 불가)
    chainsAndLoops(skip) {
        const B = this.BOXES, seen = new Set(skip), out = [];
        for (let r = 0; r < B; r++) {
            for (let c = 0; c < B; c++) {
                if (this.boxes[r][c] || seen.has(r * B + c)) continue;
                const stack = [{ r, c }], boxes = [];
                let ground = 0;
                seen.add(r * B + c);
                while (stack.length) {
                    const b = stack.pop();
                    boxes.push(b);
                    const open = this.openEdges(b.r, b.c);
                    if (open.length !== 2) return null;
                    for (const [, nb] of open) {
                        if (!nb) { ground++; continue; }
                        const k = nb.r * B + nb.c;
                        if (skip.has(k)) return null;
                        if (!seen.has(k)) { seen.add(k); stack.push(nb); }
                    }
                }
                out.push({ type: ground ? 'chain' : 'loop', len: boxes.length, boxes });
            }
        }
        return out;
    }

    // 체인·고리 c를 열어줬을 때 연 쪽의 순이득. f: 나머지를 다음에 열어야 하는 쪽의 순이득
    openValue(c, f) {
        const takeAll = -(c.len + f); // 상대가 다 먹고 나머지를 연다
        if (c.type === 'loop') return Math.min(takeAll, 8 - c.len + f); // 상대가 4칸을 넘기고 주도권 유지
        if (c.len >= 3) return Math.min(takeAll, 4 - c.len + f);         // 상대가 2칸을 넘기고 주도권 유지
        return takeAll; // 1·2칸 체인은 가운데를 그어 열면 넘겨받을 수 없다
    }

    // 체인·고리 목록에서 열어야 하는 쪽이 최선으로 얻는 순이득
    openerValue(comps, memo) {
        if (!comps.length) return 0;
        const k = comps.map(c => c.type[0] + c.len).sort().join(',');
        if (memo.has(k)) return memo.get(k);
        let best = -Infinity;
        comps.forEach((c, i) => {
            best = Math.max(best, this.openValue(c, this.openerValue(comps.filter((_, j) => j !== i), memo)));
        });
        memo.set(k, best);
        return best;
    }

    // 더블 크로스: 한쪽 끝 체인은 2번째 칸의 바깥쪽 변, 양쪽 끝은 2·3번째 칸 사이 변을 그어 두 칸짜리 묶음을 넘긴다
    doubleDealLine(seg, bothEnds) {
        const same = (a, b) => a && b && a.r === b.r && a.c === b.c;
        const p = seg[1];
        const edge = this.openEdges(p.r, p.c).find(([, nb]) => (bothEnds ? same(nb, seg[2]) : !same(nb, seg[0])));
        return edge[0];
    }

    // 체인·고리를 여는 선: 2칸 체인은 가운데 선(넘겨받기 방지), 긴 체인은 끝 선, 고리는 아무 선
    openingLine(comp) {
        const [x, y] = comp.boxes;
        if (comp.type === 'chain' && comp.len === 2) {
            return this.openEdges(x.r, x.c).find(([, nb]) => nb && nb.r === y.r && nb.c === y.c)[0];
        }
        if (comp.type === 'chain') {
            for (const b of comp.boxes) {
                const edge = this.openEdges(b.r, b.c).find(([, nb]) => !nb);
                if (edge) return edge[0];
            }
        }
        return this.openEdges(x.r, x.c)[0][0];
    }

    scoreMove(move) {
        const hLines = this.hLines.map(row => row.slice());
        const vLines = this.vLines.map(row => row.slice());
        this.setLine(move, 'blue', hLines, vLines);

        let completed = 0;
        let createsThirdSide = 0;
        let leavesAlmostBox = 0;
        for (const box of this.adjacentBoxes(move)) {
            if (this.boxes[box.r][box.c]) continue;
            const before = this.countBoxSides(box.r, box.c);
            const after = this.countBoxSides(box.r, box.c, hLines, vLines);
            if (after === 4) completed++;
            if (after === 3 && before < 3) createsThirdSide++;
            if (after === 2) leavesAlmostBox++;
        }

        const allMovesAfter = this.getAvailableMoves(hLines, vLines);
        let opponentBoxes = 0;
        for (const next of allMovesAfter) {
            for (const box of this.adjacentBoxes(next)) {
                if (!this.boxes[box.r][box.c] && this.countBoxSides(box.r, box.c, hLines, vLines) === 3) {
                    opponentBoxes++;
                    break;
                }
            }
        }

        const hardMultiplier = this.difficulty === 'hard' ? 1.4 : 1;
        return completed * 140
            - createsThirdSide * 80 * hardMultiplier
            - opponentBoxes * 2 * hardMultiplier
            + leavesAlmostBox * 3
            + Math.random() * 0.01;
    }

    getCounts() {
        return { red: this.scores.red, blue: this.scores.blue };
    }

    handleGameOver() {
        this.isGameOver = true;
        this.updateUI();
        this.draw();

        const counts = this.getCounts();
        let title = window.i18n.t('game.win');
        let desc;
        if (counts.red === counts.blue) {
            title = window.i18n.t('game.draw');
            desc = window.i18n.t('game.draw.msg');
        } else if (counts.red > counts.blue) {
            title = this.gameMode === 'ai' ? window.i18n.t('game.win') : window.i18n.t('game.win');
            desc = this.gameMode === 'ai' ? window.i18n.t('dots.you.win') : window.i18n.t('dots.red.win');
        } else {
            title = this.gameMode === 'ai' ? window.i18n.t('game.lose') : window.i18n.t('game.win');
            desc = this.gameMode === 'ai' ? window.i18n.t('dots.ai.win') : window.i18n.t('dots.blue.win');
        }

        setTimeout(() => {
            this.winTitle.textContent = title;
            this.winDesc.textContent = `${desc} (${counts.red} : ${counts.blue})`;
            this.winOverlay.classList.remove('hidden');
            if (this.gameMode === 'online' && this.onGameOver) this.onGameOver();
        }, 350);
    }

    // 온라인 대전: 재대결·상대나가기 시 판만 초기화한다(모드 화면은 건드리지 않음).
    resetGame() {
        this.reset();
    }

    // multiplayer.js가 세션 색('black'/'white', 오목 기준 좌석 라벨)과 비교하는 데 쓴다.
    // 점잇기는 빨강이 선공이라 DO 좌석 'black'(선공)을 빨강에 대응시킨다.
    get currentTurn() {
        return this.turnColor === 'red' ? 'black' : 'white';
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);
        this.drawBoard();
        this.drawBoxes();
        this.drawLines();
        this.drawDots();
    }

    drawBoard() {
        const ctx = this.ctx;
        const grad = ctx.createLinearGradient(0, 0, this.W, this.H);
        grad.addColorStop(0, '#172033');
        grad.addColorStop(1, '#07111f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.W, this.H);

        const pad = this.boardPad;
        const size = this.cellSize * (this.DOTS - 1);
        const boardGrad = ctx.createLinearGradient(pad, pad, pad + size, pad + size);
        boardGrad.addColorStop(0, '#f0bd75');
        boardGrad.addColorStop(1, '#b97938');
        ctx.fillStyle = boardGrad;
        ctx.fillRect(pad - 22, pad - 22, size + 44, size + 44);
        ctx.strokeStyle = 'rgba(58,36,18,0.55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(pad - 22, pad - 22, size + 44, size + 44);
    }

    drawBoxes() {
        const ctx = this.ctx;
        const cs = this.cellSize;
        for (let r = 0; r < this.BOXES; r++) {
            for (let c = 0; c < this.BOXES; c++) {
                const owner = this.boxes[r][c];
                if (!owner) continue;
                const p = this.point(r, c);
                ctx.save();
                ctx.globalAlpha = 0.28;
                ctx.fillStyle = owner === 'red' ? '#ef4444' : '#3b82f6';
                ctx.fillRect(p.x + 5, p.y + 5, cs - 10, cs - 10);
                ctx.restore();

                ctx.fillStyle = owner === 'red' ? 'rgba(127,29,29,0.55)' : 'rgba(30,64,175,0.55)';
                ctx.font = `800 ${Math.floor(cs * 0.3)}px Outfit, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(owner === 'red' ? 'R' : 'B', p.x + cs / 2, p.y + cs / 2);
            }
        }
    }

    drawLines() {
        const ctx = this.ctx;
        ctx.lineCap = 'round';

        const drawLine = (line, owner, alpha = 1) => {
            const a = this.point(line.r, line.c);
            const b = line.type === 'h' ? this.point(line.r, line.c + 1) : this.point(line.r + 1, line.c);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = owner === 'red' ? '#dc2626' : owner === 'blue' ? '#2563eb' : 'rgba(92,55,24,0.38)';
            ctx.lineWidth = owner ? Math.max(8, this.cellSize * 0.14) : Math.max(3, this.cellSize * 0.05);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.restore();
        };

        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS - 1; c++) {
                drawLine({ type: 'h', r, c }, this.hLines[r][c]);
            }
        }
        for (let r = 0; r < this.DOTS - 1; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                drawLine({ type: 'v', r, c }, this.vLines[r][c]);
            }
        }
        if (this.hoverLine && !this.isLineTaken(this.hoverLine)) {
            drawLine(this.hoverLine, this.turnColor, 0.48);
        }
    }

    drawDots() {
        const ctx = this.ctx;
        const radius = Math.max(5, this.cellSize * 0.09);
        for (let r = 0; r < this.DOTS; r++) {
            for (let c = 0; c < this.DOTS; c++) {
                const p = this.point(r, c);
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.35)';
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#2f2117';
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.arc(p.x - radius * 0.32, p.y - radius * 0.32, radius * 0.28, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    updateUI() {
        if (!this.redScoreEl) return;
        this.redScoreEl.textContent = this.scores.red;
        this.blueScoreEl.textContent = this.scores.blue;
        this.redPlayerEl.classList.toggle('active', this.turnColor === 'red');
        this.bluePlayerEl.classList.toggle('active', this.turnColor === 'blue');

        if (this.isGameOver) {
            this.statusEl.textContent = window.i18n.t('chess.gameover.desc');
        } else if (this.isAIThinking) {
            this.statusEl.textContent = window.i18n.t('game.ai.thinking');
        } else {
            this.statusEl.textContent = this.turnColor === 'red'
                ? window.i18n.t('dots.red.turn')
                : window.i18n.t('dots.blue.turn');
        }
    }

    refreshLang() {
        this.blueLabelEl.textContent = this.gameMode === 'ai' ? window.i18n.t('dots.ai.blue') : window.i18n.t('dots.blue');
        this.updateUI();
    }
}

window.dotsGame = new DotsGame();
