// 놀이판 팝 연출: 차례가 바뀌면 상태 글자가 톡 튀고, 이기면 색종이가 터지고, 결과 문장 숫자가 세어 올라간다.
// 게임 코드는 건드리지 않는다. 화면 변화(상태 글자, 결과 창의 hidden 해제)를 감지해 연출만 붙인다.
// 설계: docs/superpowers/specs/2026-11-02-pop-redesign-design.md §6. 검사: scripts/fx-check.mjs
const FX = (() => {
    const WIN = /승리|Wins?!|정답|완성|Solved|달성|reached 2048/;
    const NOT_WIN = /패배|Lose|무승부|Draw|펑|Boom|게임 오버|Game Over/;
    const isWin = (title) => WIN.test(title) && !NOT_WIN.test(title);

    // 문장 속 세어 올릴 숫자: 2 이상의 정수(쉼표 자리 구분 허용). 시간(1:23)·소수(3.5)의 일부는 건드리지 않는다
    function countables(text) {
        const out = [];
        for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) {
            const start = m.index, end = start + m[0].length;
            const before = text[start - 1], after = text[end];
            if (before === ':' || after === ':') continue;
            if (before === '.' && /\d/.test(text[start - 2] || '')) continue;
            if (after === '.' && /\d/.test(text[end + 1] || '')) continue;
            const value = parseInt(m[0].replace(/,/g, ''), 10);
            if (value >= 2) out.push({ start, end, value });
        }
        return out;
    }

    return { isWin, countables };
})();

// ─── 화면 연결 (검사 환경처럼 document가 없으면 건너뜀) ───
if (typeof document !== 'undefined') (() => {
    // 연출이 실패해도 게임은 그대로 돌아가야 한다
    const safe = (fn) => (...args) => { try { fn(...args); } catch (e) { /* 무시 */ } };
    const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const COLORS = ['#d63526', '#2f6fe5', '#ffcf3f'];

    // 1) 차례 튐: 상태 글자가 바뀔 때마다 fx-pop을 다시 붙여 애니메이션을 새로 시작
    const pop = safe((el) => {
        el.classList.remove('fx-pop');
        requestAnimationFrame(() => el.classList.add('fx-pop'));
    });
    for (const el of document.querySelectorAll('.status-message')) {
        let last = el.textContent;
        new MutationObserver(() => {
            if (el.textContent === last) return;
            last = el.textContent;
            pop(el);
        }).observe(el, { childList: true, characterData: true, subtree: true });
        el.addEventListener('animationend', () => el.classList.remove('fx-pop'));
    }

    // 2) 색종이: 화면 전체 캔버스에 약 1.5초, 끝나면 캔버스를 지운다
    const confetti = safe(() => {
        document.getElementById('fx-confetti')?.remove();
        const cv = document.createElement('canvas');
        cv.id = 'fx-confetti';
        cv.setAttribute('aria-hidden', 'true');
        cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1000';
        document.body.appendChild(cv);
        const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = W * dpr;
        cv.height = H * dpr;
        const c = cv.getContext('2d');
        c.scale(dpr, dpr);
        const bits = Array.from({ length: 90 }, () => ({
            x: W / 2 + (Math.random() - 0.5) * W * 0.3,
            y: H * 0.35,
            vx: (Math.random() - 0.5) * W * 1.4,
            vy: -H * (0.6 + Math.random() * 0.7),
            r: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 12,
            w: 7 + Math.random() * 6,
            h: 10 + Math.random() * 8,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
        }));
        const LIFE = 1500, G = H * 2.2, t0 = performance.now();
        let prev = t0;
        const frame = (now) => {
            const dt = Math.min(0.05, (now - prev) / 1000);
            prev = now;
            c.clearRect(0, 0, W, H);
            c.globalAlpha = Math.max(0, Math.min(1, (LIFE - (now - t0)) / 300)); // 마지막 0.3초 서서히 사라짐
            for (const b of bits) {
                b.vy += G * dt;
                b.vx *= 0.985;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.r += b.vr * dt;
                c.save();
                c.translate(b.x, b.y);
                c.rotate(b.r);
                c.fillStyle = b.color;
                c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
                c.lineWidth = 1.5;
                c.strokeStyle = '#000';
                c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
                c.restore();
            }
            if (now - t0 < LIFE) requestAnimationFrame(frame);
            else cv.remove();
        };
        requestAnimationFrame(frame);
        setTimeout(() => cv.remove(), LIFE + 1000); // 탭이 가려져 프레임이 멈춰도 지운다
    });

    // 3) 숫자 세기: 문장 속 숫자를 0부터 0.6초 동안 올린다. 게임이 그 문장을 바꾸면 그 자리에서 멈춘다
    const countUp = safe((root) => {
        const jobs = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const parts = FX.countables(n.nodeValue);
            if (parts.length) jobs.push({ node: n, text: n.nodeValue, parts, written: null, done: false });
        }
        if (!jobs.length) return;
        const render = (job, k) => {
            let s = '', i = 0;
            for (const p of job.parts) {
                const v = Math.round(p.value * k);
                s += job.text.slice(i, p.start) + (job.text.slice(p.start, p.end).includes(',') ? v.toLocaleString('en-US') : String(v));
                i = p.end;
            }
            return s + job.text.slice(i);
        };
        const write = (k) => {
            for (const j of jobs) {
                if (j.done) continue;
                if ((j.written !== null && j.node.nodeValue !== j.written) || !j.node.isConnected) { j.done = true; continue; }
                j.written = k >= 1 ? j.text : render(j, 1 - (1 - k) ** 3);
                j.node.nodeValue = j.written;
                if (k >= 1) j.done = true;
            }
            return jobs.some((j) => !j.done);
        };
        const DUR = 600, t0 = performance.now();
        write(0);
        const tick = (now) => { if (write(Math.min(1, (now - t0) / DUR))) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        setTimeout(() => write(1), DUR + 400); // 프레임이 멈춰도 최종값은 반드시 쓴다
    });

    // 4) 결과 창: hidden이 빠지는 순간 한 번 처리 (온라인 방 창은 결과 창이 아니다)
    const onShow = safe((overlay) => {
        const h2 = overlay.querySelector('.modal h2');
        if (!h2) return;
        const win = FX.isWin(h2.textContent);
        h2.classList.toggle('result-lose', !win); // 같은 창을 다음 판에 다시 쓰므로 떼기도 한다
        if (reduced()) return;
        if (win) confetti();
        for (const p of overlay.querySelectorAll('.modal p')) countUp(p);
    });
    for (const ov of document.querySelectorAll('.overlay:not(#room-panel)')) {
        let hidden = ov.classList.contains('hidden');
        new MutationObserver(() => {
            const now = ov.classList.contains('hidden');
            if (hidden && !now) onShow(ov);
            hidden = now;
        }).observe(ov, { attributes: true, attributeFilter: ['class'] });
    }
})();
