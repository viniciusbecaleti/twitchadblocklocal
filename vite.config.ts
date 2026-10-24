import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: {
    background: resolve(root, 'src/background/service-worker.ts'),
    popup: resolve(root, 'src/popup/popup.html'),
    content: resolve(root, 'src/content/twitch-observer.ts'),
    pageHook: resolve(root, 'src/content/page-hook.ts')
  }, output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: '[name][extname]' } } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] }
});
