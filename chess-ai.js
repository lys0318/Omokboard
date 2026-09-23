// 체스 AI 탐색 엔진. chess.js(0.10.3)는 수를 뽑을 때마다 기보 표기(SAN)와 체크메이트 여부까지 계산해서
// 탐색에 쓰면 한 수에 수십 초가 걸린다. 그래서 "어디에 둘지"만 여기서 가볍게 계산하고,
// 실제 착수와 규칙 판정(반복·50수 등)은 chess.js가 맡는다. 승격은 게임 UI와 같이 퀸만 본다.
const PIECE_VALUE = { p:100, n:320, b:330, r:500, q:900, k:20000 };
// Piece-square tables (white's perspective; black reads reversed)
const PST = {
    p: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [ 5,  5, 10, 25, 25, 10,  5,  5],
        [ 0,  0,  0, 20, 20,  0,  0,  0],
        [ 5, -5,-10,  0,  0,-10, -5,  5],
        [ 5, 10, 10,-20,-20, 10, 10,  5],
        [ 0,  0,  0,  0,  0,  0,  0,  0]
    ],
    n: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    b: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    r: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [ 0,  0,  0,  5,  5,  0,  0,  0]
    ],
    q: [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [ -5,  0,  5,  5,  5,  5,  0, -5],
        [  0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    k: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [ 20, 20,  0,  0,  0,  0, 20, 20],
        [ 20, 30, 10,  0,  0, 10, 30, 20]
    ]
};

// 0x88 보드: 칸 번호 = 행*16 + 열, 행 0이 8랭크. (칸 & 0x88)이 0이 아니면 판 밖.
const ChessAI = (() => {
    const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
    const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
    const BISHOP = [-17, -15, 15, 17];
    const ROOK = [-16, -1, 1, 16];
    const FILES = 'abcdefgh';
    const MATE = 100000;
    const sqName = s => FILES[s & 7] + (8 - (s >> 4));
    const sqIndex = n => (8 - Number(n[1])) * 16 + FILES.indexOf(n[0]);
    const colorOf = p => (p === p.toUpperCase() ? 'w' : 'b');

    function parse(fen) {
        const [placement, turn, castling, ep] = fen.split(' ');
        const board = new Array(128).fill(null), kings = {};
        placement.split('/').forEach((row, r) => {
            let c = 0;
            for (const ch of row) {
                if (ch >= '1' && ch <= '8') { c += Number(ch); continue; }
                const sq = r * 16 + c++;
                board[sq] = ch;
                if (ch === 'K') kings.w = sq; else if (ch === 'k') kings.b = sq;
            }
        });
        return { board, kings, turn, castling: castling === '-' ? '' : castling, ep: ep === '-' ? -1 : sqIndex(ep) };
    }

    function slides(b, sq, dirs, a, c) {
        for (const d of dirs) {
            for (let f = sq + d; !(f & 0x88); f += d) {
                const p = b[f];
                if (p) { if (p === a || p === c) return true; break; }
            }
        }
        return false;
    }

    // 칸 sq를 by 쪽 기물이 공격하고 있는가
    function attacked(pos, sq, by) {
        const b = pos.board, w = by === 'w';
        for (const d of w ? [15, 17] : [-15, -17]) { const f = sq + d; if (!(f & 0x88) && b[f] === (w ? 'P' : 'p')) return true; }
        for (const d of KNIGHT) { const f = sq + d; if (!(f & 0x88) && b[f] === (w ? 'N' : 'n')) return true; }
        for (const d of KING) { const f = sq + d; if (!(f & 0x88) && b[f] === (w ? 'K' : 'k')) return true; }
        return slides(b, sq, BISHOP, w ? 'B' : 'b', w ? 'Q' : 'q') || slides(b, sq, ROOK, w ? 'R' : 'r', w ? 'Q' : 'q');
    }

    function castles(pos, moves) {
        const us = pos.turn, them = us === 'w' ? 'b' : 'w', b = pos.board;
        const k = us === 'w' ? 116 : 4, rook = us === 'w' ? 'R' : 'r';
        if (pos.kings[us] !== k || attacked(pos, k, them)) return;
        if (pos.castling.includes(us === 'w' ? 'K' : 'k') && !b[k + 1] && !b[k + 2] && b[k + 3] === rook &&
            !attacked(pos, k + 1, them) && !attacked(pos, k + 2, them)) moves.push({ from: k, to: k + 2, castle: 'k' });
        if (pos.castling.includes(us === 'w' ? 'Q' : 'q') && !b[k - 1] && !b[k - 2] && !b[k - 3] && b[k - 4] === rook &&
            !attacked(pos, k - 1, them) && !attacked(pos, k - 2, them)) moves.push({ from: k, to: k - 2, castle: 'q' });
    }

    // 둘 차례 쪽의 수(자기 킹이 공격받는지는 아직 안 따짐). capturesOnly면 잡는 수와 승격만.
    function pseudoMoves(pos, capturesOnly) {
        const b = pos.board, us = pos.turn, moves = [];
        for (let from = 0; from < 128; from++) {
            if (from & 0x88) { from += 7; continue; }
            const p = b[from];
            if (!p || colorOf(p) !== us) continue;
            const t = p.toLowerCase();
            if (t === 'p') {
                const dir = us === 'w' ? -16 : 16, lastRow = us === 'w' ? 0 : 7, startRow = us === 'w' ? 6 : 1;
                const one = from + dir;
                if (!b[one]) {
                    const promo = (one >> 4) === lastRow;
                    if (!capturesOnly || promo) moves.push({ from, to: one, promo });
                    if (!capturesOnly && (from >> 4) === startRow && !b[one + dir]) moves.push({ from, to: one + dir, double: true });
                }
                for (const to of [one - 1, one + 1]) {
                    if (to & 0x88) continue;
                    if (b[to] && colorOf(b[to]) !== us) moves.push({ from, to, capture: b[to], promo: (to >> 4) === lastRow });
                    else if (to === pos.ep) moves.push({ from, to, ep: true, capture: us === 'w' ? 'p' : 'P' });
                }
                continue;
            }
            const dirs = t === 'n' ? KNIGHT : t === 'b' ? BISHOP : t === 'r' ? ROOK : KING;
            const slider = t === 'b' || t === 'r' || t === 'q';
            for (const d of dirs) {
                for (let to = from + d; !(to & 0x88); to += d) {
                    const q = b[to];
                    if (q) { if (colorOf(q) !== us) moves.push({ from, to, capture: q }); break; }
                    if (!capturesOnly) moves.push({ from, to });
                    if (!slider) break;
                }
            }
        }
        if (!capturesOnly) castles(pos, moves);
        return moves;
    }

    const CORNER_RIGHTS = { 116: 'KQ', 4: 'kq', 119: 'K', 112: 'Q', 7: 'k', 0: 'q' };
    function make(pos, m) {
        const b = pos.board, us = pos.turn;
        const u = { m, piece: b[m.from], captured: b[m.to], ep: pos.ep, castling: pos.castling };
        b[m.to] = m.promo ? (us === 'w' ? 'Q' : 'q') : u.piece;
        b[m.from] = null;
        if (m.ep) { u.epSq = m.to + (us === 'w' ? 16 : -16); u.captured = b[u.epSq]; b[u.epSq] = null; }
        if (m.castle) { const row = m.from & 0x70, rf = row + (m.castle === 'k' ? 7 : 0), rt = row + (m.castle === 'k' ? 5 : 3); b[rt] = b[rf]; b[rf] = null; }
        if (u.piece === 'K' || u.piece === 'k') pos.kings[us] = m.to;
        pos.ep = m.double ? (m.from + m.to) >> 1 : -1;
        if (pos.castling) {
            for (const s of [m.from, m.to]) if (CORNER_RIGHTS[s]) for (const r of CORNER_RIGHTS[s]) pos.castling = pos.castling.replace(r, '');
        }
        pos.turn = us === 'w' ? 'b' : 'w';
        return u;
    }

    function unmake(pos, u) {
        const b = pos.board, m = u.m;
        pos.turn = pos.turn === 'w' ? 'b' : 'w';
        b[m.from] = u.piece;
        if (u.epSq !== undefined) { b[m.to] = null; b[u.epSq] = u.captured; } else b[m.to] = u.captured;
        if (m.castle) { const row = m.from & 0x70, rf = row + (m.castle === 'k' ? 7 : 0), rt = row + (m.castle === 'k' ? 5 : 3); b[rf] = b[rt]; b[rt] = null; }
        if (u.piece === 'K' || u.piece === 'k') pos.kings[pos.turn] = m.from;
        pos.ep = u.ep; pos.castling = u.castling;
    }

    function legalMoves(pos, capturesOnly) {
        const us = pos.turn, them = us === 'w' ? 'b' : 'w';
        return pseudoMoves(pos, capturesOnly).filter(m => {
            const u = make(pos, m);
            const ok = !attacked(pos, pos.kings[us], them);
            unmake(pos, u);
            return ok;
        });
    }

    // 잡는 수는 "싼 기물로 비싼 기물 잡기"부터, 그다음 승격. 좋은 수를 먼저 봐야 가지치기가 잘 된다.
    function order(moves, b) {
        const key = m => (m.capture ? 10000 + PIECE_VALUE[m.capture.toLowerCase()] * 10 - PIECE_VALUE[b[m.from].toLowerCase()] : 0) + (m.promo ? 9000 : 0);
        return moves.sort((x, y) => key(y) - key(x));
    }

    // 기물 점수 + 위치 점수, 둘 차례 쪽 기준
    function evaluate(pos) {
        let score = 0;
        const b = pos.board;
        for (let sq = 0; sq < 128; sq++) {
            if (sq & 0x88) { sq += 7; continue; }
            const p = b[sq];
            if (!p) continue;
            const t = p.toLowerCase(), white = p !== t, row = sq >> 4;
            const v = PIECE_VALUE[t] + PST[t][white ? row : 7 - row][sq & 7];
            score += white ? v : -v;
        }
        return pos.turn === 'w' ? score : -score;
    }

    // 시간 제한: 정해진 시각을 넘기면 탐색을 통째로 버린다(1024노드마다 확인)
    const TIMEOUT = {};
    let deadline = Infinity, nodes = 0;
    const tick = () => { if ((++nodes & 1023) === 0 && Date.now() > deadline) throw TIMEOUT; };

    function search(pos, depth, alpha, beta, ply, quiesce) {
        tick();
        const moves = legalMoves(pos, false);
        if (!moves.length) return attacked(pos, pos.kings[pos.turn], pos.turn === 'w' ? 'b' : 'w') ? -MATE + ply : 0;
        if (depth <= 0) return quiesce ? qsearch(pos, alpha, beta, 0) : evaluate(pos);
        for (const m of order(moves, pos.board)) {
            const u = make(pos, m);
            const v = -search(pos, depth - 1, -beta, -alpha, ply + 1, quiesce);
            unmake(pos, u);
            if (v >= beta) return v;
            if (v > alpha) alpha = v;
        }
        return alpha;
    }

    // 잡는 수만 계속 이어서 읽는다. 교환 도중에 계산을 끊어 기물을 공짜로 내주는 실수(수평선 효과)를 막는다.
    // ponytail: 체크 상태에서도 가만히 있는 선택(stand pat)을 허용하고, 잡는 수는 8수까지만 이어 읽는다.
    function qsearch(pos, alpha, beta, qd) {
        tick();
        const stand = evaluate(pos);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        if (qd >= 8) return alpha;
        for (const m of order(legalMoves(pos, true), pos.board)) {
            const u = make(pos, m);
            const v = -qsearch(pos, -beta, -alpha, qd + 1);
            unmake(pos, u);
            if (v >= beta) return v;
            if (v > alpha) alpha = v;
        }
        return alpha;
    }

    function searchRoot(fen, moves, depth, quiesce) {
        const pos = parse(fen); // 시간 초과로 중간에 끊기면 판이 어긋나므로 매번 새로 만든다
        const out = [];
        let alpha = -Infinity;
        for (const { m } of moves) {
            const u = make(pos, m);
            const score = -search(pos, depth - 1, -Infinity, -alpha, 1, quiesce);
            unmake(pos, u);
            out.push({ m, score });
            if (score > alpha) alpha = score;
        }
        return out.sort((a, b) => b.score - a.score);
    }

    // 둘 수 있는 수를 좋은 순서로 돌려준다: [{ from:'e7', to:'e5', promotion?:'q', score }]
    // 1수부터 깊이를 늘려가며 읽고(반복 심화), sureDepth까지는 끝까지, 그보다 깊은 단계는 budgetMs 안에 끝날 때만 쓴다.
    function rank(fen, maxDepth, quiesce, sureDepth = maxDepth, budgetMs = Infinity) {
        const pos = parse(fen);
        let best = order(legalMoves(pos, false), pos.board).map(m => ({ m, score: 0 }));
        const start = Date.now();
        for (let depth = 1; depth <= maxDepth && best.length; depth++) {
            deadline = depth <= sureDepth ? Infinity : start + budgetMs;
            try { best = searchRoot(fen, best, depth, quiesce); } catch (e) { if (e !== TIMEOUT) throw e; break; }
        }
        deadline = Infinity;
        return best.map(({ m, score }) => ({ from: sqName(m.from), to: sqName(m.to), promotion: m.promo ? 'q' : undefined, score }));
    }

    // 검사용: 주어진 깊이까지의 수 경우의 수(perft)
    function perft(fen, depth) {
        const pos = parse(fen);
        const walk = d => {
            if (d === 0) return 1;
            let n = 0;
            for (const m of legalMoves(pos, false)) { const u = make(pos, m); n += walk(d - 1); unmake(pos, u); }
            return n;
        };
        return walk(depth);
    }

    return { rank, perft };
})();
