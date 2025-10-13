import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    platform: 'neutral',
    format: ['cjs', 'esm'],
    dts: true,
    shims: true,
    clean: true,
    external: ['discord.js', 'undici', 'vitest'],
  },
])
