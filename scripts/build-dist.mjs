// 사이트 자산만 dist/로 복사한다. 허용 목록 방식이라 docs·node_modules 등이 섞일 수 없다.
import { readdir, mkdir, copyFile, rm, stat } from 'node:fs/promises';
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
console.log(`dist/ 생성 완료 (최상위 항목 ${count}개)`);
