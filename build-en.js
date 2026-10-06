// ponytail: 영어판은 손으로 복제하지 않고 한국어 페이지에서 찍어낸다.
// 콘텐츠 바꾸면 `node build-en.js` 다시 실행 → /en/*.html + sitemap 재생성.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = __dirname;
const BASE = 'https://omokboard.com/';

// 페이지별 작성일·수정일(page-dates.json). 수정일은 화면에 보이는 본문이 바뀐 날에만 올린다.
// 캐시 버전·head 메타·구조화 데이터만 바뀐 날은 수정으로 치지 않는다(사이트맵 lastmod가 거짓말하지 않게).
const DATES_FILE = path.join(DIR, 'page-dates.json');
const DATES = JSON.parse(fs.readFileSync(DATES_FILE, 'utf8'));
const TODAY = new Date().toLocaleDateString('sv-SE'); // 로컬(KST) YYYY-MM-DD
const bodyText = h => (h.split('<body')[1] || '')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/g, '')
  .replace(/<p class="article-meta"[\s\S]*?<\/p>/g, '')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

// 영어 제목/설명 (페이지별)
const META = {
  index:            { t:'Omokboard - Free Online Board Games | Omok, Chess, Sudoku & More', d:'Play 12 free online board games: Omok (Gomoku), Connect 4, Reversi, Dots and Boxes, Chess, Alkkagi, Yut Nori, Sudoku, Tic-Tac-Toe, Minesweeper, 2048, and a Ladder Game. No install. Play vs AI or 2-player.' },
  omok:             { t:'Omok (Gomoku) - Free Online Five in a Row | Omokboard', d:'Play free online Omok (Gomoku). Connect five stones in a row to win. Play vs AI (easy/normal/hard) or 2-player, no install.' },
  connect4:         { t:'Connect 4 - Free Online Four in a Row | Omokboard', d:'Play free online Connect 4 (four in a row), a free-placement variant. Play vs AI or 2-player, no install.' },
  reversi:          { t:'Reversi (Othello) - Free Online | Omokboard', d:'Play free online Reversi / Othello. Flip discs to own the most squares. Play vs AI or 2-player, no install.' },
  dots:             { t:'Dots and Boxes - Free Online | Omokboard', d:'Play free online Dots and Boxes. Complete the fourth side of a box to score. Play vs AI or 2-player, no install.' },
  chess:            { t:'Chess - Free Online | Omokboard', d:'Play free online Chess with full rules, including castling, en passant, and promotion. Play vs AI or 2-player, no install.' },
  alkkagi:          { t:'Alkkagi - Free Online Korean Marble-Flicking Game | Omokboard', d:'Play free online Alkkagi, the Korean flicking game. Knock your opponent off the board. Play vs AI or 2-player.' },
  yut:              { t:'Yut Nori - Free Online Korean Board Game | Omokboard', d:'Play free online Yut Nori. Throw the yut sticks and race all four mal home first. Play vs AI or 2-player, no install.' },
  sudoku:           { t:'Sudoku - Free Online (Solo & Duel) | Omokboard', d:'Play free online Sudoku with unique-solution puzzles. Solo mode plus a 1v1 / AI duel mode. No install.' },
  tictactoe:        { t:'Tic-Tac-Toe - Free Online (Classic & Ultimate) | Omokboard', d:'Play free online Tic-Tac-Toe, both classic 3×3 and Ultimate Tic-Tac-Toe. Play vs AI or 2-player, no install.' },
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
  minesweeper:      { t:'Minesweeper - Free Online Game | Omokboard', d:'Play free online Minesweeper. Three difficulty levels, safe first click guaranteed. Right-click or Flag Mode to mark mines. No install.' },
  '2048':           { t:'2048 - Free Online Number Puzzle | Omokboard', d:'Play free online 2048. Merge matching tiles with arrow keys or swipe to reach the 2048 tile. Best score saved automatically. No install.' },
  ladder:           { t:'Ladder Game (Amidakuji) - Free Online | Omokboard', d:'Play a free online ladder game (Amidakuji). 2–6 players, type your own results, and let a random ladder decide. No install.' },
  'minesweeper-guide': { t:'Minesweeper Guide - Reading Numbers | Omokboard', d:'Learn Minesweeper number logic, flag tips, and how to solve without guessing.' },
  '2048-guide':        { t:'2048 Strategy Guide | Omokboard', d:'Learn the 2048 corner strategy and tile-ordering tricks for a high score.' },
  'ladder-guide':      { t:'Ladder Game Guide (Amidakuji) | Omokboard', d:'Learn how the ladder game works, why it is always fair, and when to use it.' },
  'ladder-uses':       { t:'Ladder Game Uses: Penalties, Teams & Order | Omokboard', d:'Use a ladder game (Amidakuji) to fairly decide penalties, team splits, who pays, and cleanup or presentation order. Free, no install.' },
  'korean-games':      { t:'Korean Traditional Games: Yut Nori & Alkkagi | Omokboard', d:'The history, culture, and rules of Korean traditional games Yut Nori and Alkkagi. Play them free online, no install.' },
  'free-board-games':  { t:'Free Online Board Games: 12 to Play, No Install | Omokboard', d:'A roundup of 12 free online board games playable instantly in the browser, with no install and no sign-up. Compare and pick one to play.' },
  'brain-training':    { t:'Brain Games and Cognitive Skills | Omokboard', d:'What each Omokboard game actually trains: pattern recognition, logical deduction, planning ahead, spatial organization, risk management, and hand-eye feel.' },
  'game-recommendations': { t:'Game Recommendations by Situation | Omokboard', d:'Which Omokboard game fits your situation: solo training, playing with kids, head-to-head with a friend, holidays, a quick 5 minutes, or going deep.' },
  'omok-history':      { t:'The History and Origins of Omok (Gomoku) | Omokboard', d:'Where Omok came from, why the first player wins under free-style rules, and how Renju’s forbidden moves (double-three, double-four, overline) balance the game.' },
  'online-play-guide': { t:'Online Play Guide: Play Friends with a Room Code | Omokboard', d:'How to create a room, share the code, reconnect after a drop, and rematch. Which of Omokboard’s games support online play, with no sign-up required.' },
  'chess-openings':    { t:'Chess Openings for Beginners | Omokboard', d:'The three opening principles (center, development, king safety), plus the Italian Game, London System, Sicilian Defense, French Defense, and common beginner mistakes.' },
  'board-games-for-kids': { t:'Board Games to Play With Kids by Age | Omokboard', d:'Which Omokboard games fit ages 4 to 13+, why playing together on one screen matters, and what parents should know: no sign-up, no chat, no payments.' },
  about:            { t:'About | Omokboard', d:'Omokboard is a free online board game site with 12 games. Play the AI, a friend on the same device, or a friend online by room code, with nothing to install.' },
  contact:          { t:'Contact | Omokboard', d:'Contact Omokboard about bugs, mistakes in a guide, AI difficulty, new game ideas, or privacy and advertising questions, plus what details help with a bug report.' },
  privacy:          { t:'Privacy Policy | Omokboard', d:'How Omokboard handles access logs, Google Analytics statistics, online play data, browser storage, and Google AdSense and Kakao AdFit advertising cookies.' }
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
// 특정 @type의 JSON-LD 블록 제거(재실행 대비). 다른 LD 블록까지 넘어가 지우지 않도록 </script>를 넘지 않는다.
const stripLd = (html, type) => html.replace(new RegExp(`\\s*<script type="application\\/ld\\+json">(?:(?!<\\/script>)[\\s\\S])*?"@type": "${type}"(?:(?!<\\/script>)[\\s\\S])*?<\\/script>`, 'g'), '');
const stripFaqLd = html => stripLd(html, 'FAQPage');
function injectFaq(html, region) {
  html = stripFaqLd(html);
  const ld = faqLd(region);
  return ld ? html.replace('</head>', ld + '</head>') : html;
}

const slugs = Object.keys(META);
const enDir = path.join(DIR, 'en');
if (!fs.existsSync(enDir)) fs.mkdirSync(enDir);

// 글 페이지: 작성일·수정일·작성자를 보여주고 Article 구조화 데이터를 단다
const ARTICLES = new Set(slugs.filter(s => /-guide$/.test(s)).concat([
  'omok-history', 'chess-openings', 'board-games-for-kids', 'korean-games',
  'game-recommendations', 'brain-training', 'ladder-uses', 'free-board-games'
]));
const koDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${y}년 ${m}월 ${dd}일`; };
const enDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const articleMeta = d =>
  `<p class="article-meta" style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem;">` +
  `<span class="ko-only">작성 <time datetime="${d.published}">${koDate(d.published)}</time> · 수정 <time datetime="${d.modified}">${koDate(d.modified)}</time> · <a href="about" style="color:var(--accent-blue);text-decoration:none;">오목보드 운영자</a></span>` +
  `<span class="en-only" style="display:none;">Published <time datetime="${d.published}">${enDate(d.published)}</time> · Updated <time datetime="${d.modified}">${enDate(d.modified)}</time> · By <a href="about" style="color:var(--accent-blue);text-decoration:none;">the Omokboard developer</a></span></p>`;
function articleLd(slug, d, lang, headline, description, image) {
  const name = lang === 'ko' ? '오목보드' : 'Omokboard';
  const data = {
    '@context': 'https://schema.org', '@type': 'Article', headline, description, inLanguage: lang,
    datePublished: d.published, dateModified: d.modified, mainEntityOfPage: url(slug, false), image,
    author: { '@type': 'Organization', name, url: BASE + 'about' },
    publisher: { '@type': 'Organization', name, url: BASE }
  }; // 영어판 URL은 아래 /en/ 치환에서 함께 바뀐다
  return `    <script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n    </script>\n`;
}
const injectArticle = (html, ld) => stripLd(html, 'Article').replace('</head>', ld + '</head>');

for (const slug of slugs) {
  let ko = fs.readFileSync(path.join(DIR, slug + '.html'), 'utf8');

  const hash = crypto.createHash('sha1').update(bodyText(ko)).digest('hex');
  const d = DATES[slug] || (DATES[slug] = { published: TODAY, modified: TODAY });
  if (d.hash && d.hash !== hash) d.modified = TODAY;
  d.hash = hash;
  const isArticle = ARTICLES.has(slug);
  const image = (ko.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
  if (isArticle) {
    ko = ko.replace(/\n[ \t]*<p class="article-meta"[\s\S]*?<\/p>/, '');
    ko = ko.replace(/(<p class="subtitle">[\s\S]*?<\/p>)/, `$1\n            ${articleMeta(d)}`);
  }

  // 한/영 영역 분리 (en-only div 기준)
  const splitAt = ko.indexOf('<div class="en-only"');
  const koRegion = splitAt >= 0 ? ko.slice(0, splitAt) : ko;
  const enRegion = splitAt >= 0 ? ko.slice(splitAt) : ko;

  // 1) 한국어 페이지: hreflang(없을 때만) + FAQPage(ko) 주입
  if (!/hreflang=/.test(ko)) {
    ko = ko.replace(/(<link rel="canonical"[^>]*>)/, `$1\n${hreflang(slug)}`);
  }
  ko = injectFaq(ko, koRegion);
  if (isArticle) {
    const title = (ko.match(/<title>([\s\S]*?)<\/title>/) || [])[1].replace(/\s*[-|]\s*오목보드.*$/, '');
    const desc = (ko.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    ko = injectArticle(ko, articleLd(slug, d, 'ko', title, desc, image));
  }
  fs.writeFileSync(path.join(DIR, slug + '.html'), ko);

  // 2) 영어판 생성
  let en = ko;
  en = injectFaq(en, enRegion); // 영어 FAQPage로 교체
  if (isArticle) en = injectArticle(en, articleLd(slug, d, 'en', META[slug].t.replace(/\s*\|\s*Omokboard$/, ''), META[slug].d, image));
  en = en.replace(/https:\/\/omokboard\.com\//g, 'https://omokboard.com/en/'); // 자기 URL·JSON-LD → /en/
  en = en.replace(/https:\/\/omokboard\.com\/en\/og-image\.png/g, 'https://omokboard.com/og-image.png'); // og-image는 루트 유지 (og:image·twitter:image 둘 다)
  en = en.replace(/https:\/\/omokboard\.com\/en\/og\//g, 'https://omokboard.com/og/'); // 게임별 og 이미지(/og/*.png)도 루트 유지 (og:image·twitter:image·JSON-LD image)
  en = en.replace(/\s*<link rel="alternate" hreflang="[^"]*"[^>]*>/g, '');     // 기존 hreflang 제거
  en = en.replace(/(<link rel="canonical"[^>]*>)/, `$1\n${hreflang(slug)}`);   // 올바른 hreflang 재주입
  en = en.replace('<html lang="ko">', '<html lang="en">');
  en = en.replace(/placeholder="예: /g, 'placeholder="e.g. '); // 속성값은 한/영 span으로 감쌀 수 없어서 여기서 바꾼다
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
    sm += `  <url>\n    <loc>${url(slug, en)}</loc>\n    <lastmod>${DATES[slug].modified}</lastmod>\n` +
          `    <changefreq>${freq(slug)}</changefreq>\n    <priority>${pri(slug)}</priority>\n  </url>\n`;
  }
}
sm += '</urlset>\n';
fs.writeFileSync(path.join(DIR, 'sitemap.xml'), sm);
fs.writeFileSync(DATES_FILE, JSON.stringify(DATES, null, 2) + '\n');

console.log(`Generated ${slugs.length} EN pages + sitemap (${slugs.length*2} URLs).`);
