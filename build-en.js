// ponytail: 영어판은 손으로 복제하지 않고 한국어 페이지에서 찍어낸다.
// 콘텐츠 바꾸면 `node build-en.js` 다시 실행 → /en/*.html + sitemap 재생성.
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const BASE = 'https://omokboard.com/';
const DATE = '2026-06-17';

// 영어 제목/설명 (페이지별)
const META = {
  index:            { t:'Omokboard - Free Online Board Games | Omok, Chess, Sudoku & More', d:'Play 9 free online board games — Omok (Gomoku), Connect 4, Reversi, Dots and Boxes, Chess, Alkkagi, Yut Nori, Sudoku, and Tic-Tac-Toe. No install. Play vs AI or 2-player.' },
  omok:             { t:'Omok (Gomoku) - Free Online Five in a Row | Omokboard', d:'Play free online Omok (Gomoku). Connect five stones in a row to win. Play vs AI (easy/normal/hard) or 2-player, no install.' },
  connect4:         { t:'Connect 4 - Free Online Four in a Row | Omokboard', d:'Play free online Connect 4 (four in a row), a free-placement variant. Play vs AI or 2-player, no install.' },
  reversi:          { t:'Reversi (Othello) - Free Online | Omokboard', d:'Play free online Reversi / Othello. Flip discs to own the most squares. Play vs AI or 2-player, no install.' },
  dots:             { t:'Dots and Boxes - Free Online | Omokboard', d:'Play free online Dots and Boxes. Complete the fourth side of a box to score. Play vs AI or 2-player, no install.' },
  chess:            { t:'Chess - Free Online | Omokboard', d:'Play free online Chess with full rules — castling, en passant, promotion. Play vs AI or 2-player, no install.' },
  alkkagi:          { t:'Alkkagi - Free Online Korean Marble-Flicking Game | Omokboard', d:'Play free online Alkkagi, the Korean flicking game. Knock your opponent off the board. Play vs AI or 2-player.' },
  yut:              { t:'Yut Nori - Free Online Korean Board Game | Omokboard', d:'Play free online Yut Nori. Throw the yut sticks and race all four mal home first. Play vs AI or 2-player, no install.' },
  sudoku:           { t:'Sudoku - Free Online (Solo & Duel) | Omokboard', d:'Play free online Sudoku with unique-solution puzzles. Solo mode plus a 1v1 / AI duel mode. No install.' },
  tictactoe:        { t:'Tic-Tac-Toe - Free Online (Classic & Ultimate) | Omokboard', d:'Play free online Tic-Tac-Toe — classic 3×3 and Ultimate Tic-Tac-Toe. Play vs AI or 2-player, no install.' },
  guides:           { t:'Board Game Guides | Omokboard', d:'Rules and beginner strategy for Omok, Connect 4, Reversi, Dots and Boxes, Chess, Alkkagi, Yut Nori, Sudoku, and Tic-Tac-Toe.' },
  'omok-guide':     { t:'Omok (Gomoku) Rules & Strategy Guide | Omokboard', d:'Learn Omok rules, threat shapes (open three and four), opening play, double threats, and defense order.' },
  'connect4-guide': { t:'Connect 4 Rules & Strategy Guide | Omokboard', d:'Learn Connect 4 rules and strategy: open threes, double threats, and defense in four-in-a-row.' },
  'reversi-guide':  { t:'Reversi (Othello) Strategy Guide | Omokboard', d:'Learn Reversi strategy: corners, X/C squares, mobility, and endgame counting.' },
  'dots-guide':     { t:'Dots and Boxes Strategy Guide | Omokboard', d:'Learn Dots and Boxes: safe moves, chains, the double-cross, and parity.' },
  'chess-guide':    { t:'Chess Rules & Basics Guide | Omokboard', d:'Learn chess piece moves, special rules, opening principles, and tactics (fork, pin, skewer).' },
  'alkkagi-guide':  { t:'Alkkagi Guide & Tips | Omokboard', d:'Learn Alkkagi: controls, power control, angles, and safe positioning.' },
  'yut-guide':      { t:'Yut Nori Rules & Strategy Guide | Omokboard', d:'Learn Yut Nori: Do/Gae/Geol/Yut/Mo, shortcuts, capturing, stacking, and winning strategy.' },
  'sudoku-guide':   { t:'How to Solve Sudoku - Guide | Omokboard', d:'Learn Sudoku techniques: scanning, naked singles, hidden singles, and pencil marks.' },
  'tictactoe-guide':{ t:'Tic-Tac-Toe Strategy (Classic & Ultimate) | Omokboard', d:'Learn Tic-Tac-Toe strategy: forks, the never-lose order, and Ultimate Tic-Tac-Toe rules and tactics.' },
  about:            { t:'About | Omokboard', d:'Omokboard is a free online board game site with 9 games — play vs AI or 2-player, no install required.' },
  contact:          { t:'Contact | Omokboard', d:'Contact Omokboard for bug reports, suggestions, or privacy and advertising inquiries.' },
  privacy:          { t:'Privacy Policy | Omokboard', d:'Omokboard privacy policy — what we collect, how it is used, and third-party services.' }
};

const PRI = { index:'1.0', omok:'0.9', guides:'0.7', about:'0.5', contact:'0.4', privacy:'0.3' };
const YEARLY = new Set(['contact','privacy']);
const pri = s => PRI[s] || (/-guide$/.test(s) ? '0.6' : '0.8');
const freq = s => s==='index' ? 'weekly' : YEARLY.has(s) ? 'yearly' : 'monthly';
const url = (slug, en) => BASE + (en ? 'en/' : '') + (slug==='index' ? '' : slug);

function hreflang(slug) {
  return `    <link rel="alternate" hreflang="ko" href="${url(slug,false)}">\n` +
         `    <link rel="alternate" hreflang="en" href="${url(slug,true)}">\n` +
         `    <link rel="alternate" hreflang="x-default" href="${url(slug,false)}">`;
}

// 가이드 FAQ 섹션 → FAQPage JSON-LD (해당 언어 영역만 파싱)
const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function faqLd(region) {
  const qa = [];
  const secRe = /<h2>[^<]*(?:자주 묻는 질문|FAQ)[^<]*<\/h2>\s*<ul class="rule-list">([\s\S]*?)<\/ul>/g;
  let s;
  while ((s = secRe.exec(region))) {
    const itemRe = /<li><strong>([\s\S]*?)<\/strong>\s*([\s\S]*?)<\/li>/g;
    let it;
    while ((it = itemRe.exec(s[1]))) {
      const q = strip(it[1]), a = strip(it[2]);
      if (q && a) qa.push({ q, a });
    }
  }
  if (!qa.length) return '';
  const data = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qa.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } }))
  };
  return `    <script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n    </script>\n`;
}
// FAQPage 블록 제거(재실행 대비) + 주입
const stripFaqLd = html => html.replace(/\s*<script type="application\/ld\+json">\s*\{\s*"@context"[^]*?"@type": "FAQPage"[^]*?<\/script>/g, '');
function injectFaq(html, region) {
  html = stripFaqLd(html);
  const ld = faqLd(region);
  return ld ? html.replace('</head>', ld + '</head>') : html;
}

const slugs = Object.keys(META);
const enDir = path.join(DIR, 'en');
if (!fs.existsSync(enDir)) fs.mkdirSync(enDir);

for (const slug of slugs) {
  let ko = fs.readFileSync(path.join(DIR, slug + '.html'), 'utf8');

  // 한/영 영역 분리 (en-only div 기준)
  const splitAt = ko.indexOf('<div class="en-only"');
  const koRegion = splitAt >= 0 ? ko.slice(0, splitAt) : ko;
  const enRegion = splitAt >= 0 ? ko.slice(splitAt) : ko;

  // 1) 한국어 페이지: hreflang(없을 때만) + FAQPage(ko) 주입
  if (!/hreflang=/.test(ko)) {
    ko = ko.replace(/(<link rel="canonical"[^>]*>)/, `$1\n${hreflang(slug)}`);
  }
  ko = injectFaq(ko, koRegion);
  fs.writeFileSync(path.join(DIR, slug + '.html'), ko);

  // 2) 영어판 생성
  let en = ko;
  en = injectFaq(en, enRegion); // 영어 FAQPage로 교체
  en = en.replace(/https:\/\/omokboard\.com\//g, 'https://omokboard.com/en/'); // 자기 URL·JSON-LD → /en/
  en = en.replace('https://omokboard.com/en/og-image.png', 'https://omokboard.com/og-image.png'); // og-image는 루트 유지
  en = en.replace(/\s*<link rel="alternate" hreflang="[^"]*"[^>]*>/g, '');     // 기존 hreflang 제거
  en = en.replace(/(<link rel="canonical"[^>]*>)/, `$1\n${hreflang(slug)}`);   // 올바른 hreflang 재주입
  en = en.replace('<html lang="ko">', '<html lang="en">');
  const m = META[slug];
  en = en.replace(/<title>[\s\S]*?<\/title>/, `<title>${m.t}</title>`);
  en = en.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${m.d}$2`);
  en = en.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${m.t}$2`);
  en = en.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${m.d}$2`);
  en = en.replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${m.t}$2`);
  en = en.replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${m.d}$2`);
  en = en.replace(/(<meta property="og:type"[^>]*>)/, `$1\n    <meta property="og:locale" content="en_US">`);
  // 루트 자산(js/css) → 절대경로 (/en/ 하위에서도 동작)
  en = en.replace(/(src|href)="([\w-]+\.(?:js|css))(\?[^"]*)?"/g, (mm,a,f,q) => `${a}="/${f}${q||''}"`);
  en = en.replace(/href="\/"/g, 'href="/en/"'); // 홈 링크 → 영어 홈

  fs.writeFileSync(path.join(enDir, slug + '.html'), en);
}

// 3) sitemap (한국어 + 영어)
let sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for (const en of [false, true]) {
  for (const slug of slugs) {
    sm += `  <url>\n    <loc>${url(slug, en)}</loc>\n    <lastmod>${DATE}</lastmod>\n` +
          `    <changefreq>${freq(slug)}</changefreq>\n    <priority>${pri(slug)}</priority>\n  </url>\n`;
  }
}
sm += '</urlset>\n';
fs.writeFileSync(path.join(DIR, 'sitemap.xml'), sm);

console.log(`Generated ${slugs.length} EN pages + sitemap (${slugs.length*2} URLs).`);
