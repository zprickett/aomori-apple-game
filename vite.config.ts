import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE=1 produces one self-contained index.html (all JS, models and icons inlined)
// suitable for sharing as a single file / hosted artifact.
const single = process.env.SINGLE === '1'

export default defineConfig({
  base: './',
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  assetsInclude: ['**/*.glb'],
  build: {
    outDir: single ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: single ? 100_000_000 : 4096,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any)
