// 디자인 개편(놀이판 팝) 정적 검사: 글꼴 링크, style.css 버전, 색 토큰 대비, 대체 글꼴.
// 실행: node scripts/design-check.mjs  (실패 항목을 한 줄씩 출력, 하나라도 있으면 exit 1)
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const pages = readdirSync(root).filter((f) => f.endsWith('.html')); // 루트의 한국어 원본만 (en/, dist/ 제외)
const GAMES = {
  trad: ['yut', 'alkkagi', 'ttakji'],
  brain: ['omok', 'chess', 'reversi', 'connect4', 'dots', 'tictactoe'],
  solo: ['number-baseball', 'sudoku', 'minesweeper', '2048', 'ladder'],
};

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failed++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

// 1) 글꼴 링크와 style.css 버전
for (const f of pages) {
  const h = read(f);
  check(`${f}: Outfit 없음`, !h.includes('Outfit'));
  check(`${f}: Black Han Sans 링크`, h.includes('fonts.googleapis.com/css2?family=Black+Han+Sans'));
  check(`${f}: Pretendard 링크`, h.includes('pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'));
  check(`${f}: jsDelivr preconnect`, h.includes('rel="preconnect" href="https://cdn.jsdelivr.net"'));
  check(`${f}: style.css?v=16`, h.includes('style.css?v=16'));
}
for (const f of ['style.css', 'dots.js', 'yut.js']) check(`${f}: Outfit 없음`, !read(f).includes('Outfit'));

// 2) 색 토큰 대비 (WCAG 상대 휘도)
const css = read('style.css');
const rootBlock = (css.match(/:root\s*{([\s\S]*?)}/) || [])[1] || '';
const tokens = {};
for (const [, k, v] of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[k] = v.trim();
const color = (x) => {
  for (let i = 0; i < 5 && x && x.startsWith('var('); i++) x = tokens[x.slice(4, -1).trim()];
  if (!x || !/^#[0-9a-f]{3,6}$/i.test(x)) return null;
  if (x.length === 4) x = '#' + [...x.slice(1)].map((c) => c + c).join('');
  return x;
};
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const PAIRS = [
  ['--text-main', '--bg-dark'], ['--text-main', '--surface'], ['--text-muted', '--surface'], ['--text-muted', '--bg-dark'],
  ['#fff', '--pop-red'], ['#fff', '--pop-blue'], ['--on-yellow', '--pop-yellow'], ['--accent-blue', '--bg-dark'],
  ['--on-yellow', '--accent-blue-hover'], ['#fff', '--accent-hover'],
  // 부품(Task 3): 모드 버튼 글자·설명, 부제 스티커, 보조 버튼(평소·올림)
  ['--bg-dark', '--text-main'], ['#5a4a3a', '--text-main'], ['#5a4a3a', '#ffffff'],
  ['--text-main', '--surface-2'], ['--text-main', '#42332a'],
];
for (const [a, b] of PAIRS) {
  const ca = color(a.startsWith('#') ? a : `var(${a})`), cb = color(b.startsWith('#') ? b : `var(${b})`);
  if (!ca || !cb) { check(`대비 ${a} / ${b}`, false, '토큰 없음'); continue; }
  const r = ratio(ca, cb);
  check(`대비 ${a} / ${b}`, r >= 4.5, `${r.toFixed(2)}:1 (${ca} / ${cb})`);
}

// 3) 대체 글꼴 (글꼴 서버가 막혀도 글자가 보이게)
for (const k of ['--font-display', '--font-body']) {
  const v = tokens[k] || '';
  check(`${k} 대체 글꼴`, v.includes("'Malgun Gothic'") && /sans-serif\s*$/.test(v), v || '없음');
}

// 4) 게임 페이지 분류 표시 <body data-cat>
for (const [cat, games] of Object.entries(GAMES)) {
  for (const g of games) {
    const body = (read(`${g}.html`).match(/<body[^>]*>/) || [''])[0];
    check(`${g}.html: data-cat="${cat}"`, body.includes(`data-cat="${cat}"`), body);
  }
}

// 5) 노랑(--accent-blue) 배경 위 밝은 글자 금지 — 규칙·인라인 style 하나하나 검사
const LIGHT = /^(#fff|#ffffff|white|var\(--text-main\))$/i;
const BG_YELLOW = /background(?:-color)?\s*:[^;]*var\(--accent-blue(?:-hover)?\)/;
const colorOf = (decl) => ((decl.match(/(?:^|[;\s{])color\s*:\s*([^;]+)/) || [])[1] || '').trim();
for (const f of pages) {
  const h = read(f);
  const rules = [];
  for (const [, block] of h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const [, sel, decl] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ sel: sel.trim(), decl });
  }
  const base = Object.fromEntries(rules.map((r) => [r.sel, r.decl]));
  for (const r of rules) {
    if (!BG_YELLOW.test(r.decl)) continue;
    let c = colorOf(r.decl);
    if (!c && r.sel.includes(':hover')) c = colorOf(base[r.sel.replace(/:hover/g, '')] || '');
    check(`${f}: 노랑 배경 위 밝은 글자 (${r.sel})`, !LIGHT.test(c), c);
  }
  for (const [, decl] of h.matchAll(/style="([^"]*)"/g)) {
    if (BG_YELLOW.test(decl)) check(`${f}: 노랑 배경 위 밝은 글자 (인라인)`, !LIGHT.test(colorOf(decl)), decl.slice(0, 80));
  }
}

if (failed) { console.log(`${failed}개 실패`); process.exit(1); }
console.log('OK');
