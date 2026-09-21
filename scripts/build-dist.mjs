// 사이트 자산만 dist/로 복사한다. 허용 목록 방식이라 docs·node_modules 등이 섞일 수 없다.
import { readdir, mkdir, copyFile, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist');

const COPY_DIRS = ['en', 'og', 'adapters'];                       // 통째로 복사할 디렉터리
const COPY_EXT = ['.html', '.css', '.js', '.svg', '.png', '.xml', '.txt'];
const COPY_EXACT = ['_headers'];                                  // 확장자 없는 파일
const EXCLUDE_FILES = ['build-en.js'];                            // 빌드 도구는 배포 대상 아님

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const name of await readdir(src)) {
    const s = join(src, name), d = join(dest, name);
    if ((await stat(s)).isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

// dist 자체를 지우면 wrangler dev가 잡고 있을 때 Windows에서 EBUSY가 난다.
// 디렉터리는 두고 안의 내용만 비운다.
await mkdir(OUT, { recursive: true });
for (const name of await readdir(OUT)) {
  await rm(join(OUT, name), { recursive: true, force: true });
}

let count = 0;
for (const name of await readdir(ROOT)) {
  if (EXCLUDE_FILES.includes(name)) continue;
  const src = join(ROOT, name);
  if ((await stat(src)).isDirectory()) {
    if (!COPY_DIRS.includes(name)) continue;
    await copyDir(src, join(OUT, name));
    count++;
  } else if (COPY_EXT.includes(extname(name)) || COPY_EXACT.includes(name)) {
    await copyFile(src, join(OUT, name));
    count++;
  }
}
// 소스 HTML은 한/영 본문을 둘 다 담고 있지만(언어 전환은 /x ↔ /en/x URL 이동),
// 배포본엔 그 페이지 언어만 남긴다. 반대 언어 블록은 화면에 절대 안 나오는 숨김 텍스트라
// 검색엔진에 중복·숨김 콘텐츠로 보인다.
function dropLang(html, cls) {
  const open = new RegExp(`<(div|span|strong)\\b[^>]*class="${cls}"[^>]*>`, 'g');
  let out = '', last = 0, m;
  while ((m = open.exec(html))) {
    const close = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, 'g');
    close.lastIndex = open.lastIndex;
    let depth = 1, t;
    while (depth && (t = close.exec(html))) depth += t[1] ? -1 : 1;
    if (!t) throw new Error(`닫히지 않은 <${m[1]} class="${cls}">`);
    out += html.slice(last, m.index);
    last = open.lastIndex = close.lastIndex;
  }
  return out + html.slice(last);
}
const balance = (h, tag) => (h.match(new RegExp(`<${tag}\\b`, 'g')) || []).length - (h.match(new RegExp(`</${tag}>`, 'g')) || []).length;

async function htmlFiles(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...await htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

let stripped = 0;
for (const file of await htmlFiles(OUT)) {
  const src = await readFile(file, 'utf8');
  const en = /<html lang="en">/.test(src);
  let html = dropLang(src, en ? 'ko-only' : 'en-only');
  if (en) html = html.replace(/class="en-only" style="display:none;"/g, 'class="en-only"'); // JS 없이도 영어가 보이게
  // 빌드 자체가 검증: 반대 언어가 남거나 태그 짝이 깨지면 배포 중단
  if (/class="[^"]*\b(ko|en)-only\b/.test(html.replace(new RegExp(`class="${en ? 'en' : 'ko'}-only"`, 'g'), ''))) throw new Error(`${file}: 반대 언어 블록이 남음`);
  for (const tag of ['div', 'span', 'strong']) {
    if (balance(html, tag) !== balance(src, tag)) throw new Error(`${file}: <${tag}> 짝이 깨짐`);
  }
  if (html !== src) { await writeFile(file, html); stripped++; }
}

console.log(`dist/ 생성 완료 (최상위 항목 ${count}개, 반대 언어 제거 ${stripped}개 페이지)`);
