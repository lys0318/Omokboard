import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// pool-workers 0.18 + vitest 4 부터는 pool 옵션이 아니라 Vite 플러그인으로 붙인다.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
});
