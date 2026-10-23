import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));
export default defineConfig({ define: { __EXTENSION_VERSION__: JSON.stringify(version) }, build: { outDir: 'dist', emptyOutDir: false, lib: { entry: resolve(import.meta.dirname, 'src/player/custom-player.ts'), name: 'TwitchAdBlockPlayer', formats: ['iife'], fileName: () => 'customPlayer.js' } } });
