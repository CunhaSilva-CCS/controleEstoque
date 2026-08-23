import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'

const enableElectron = process.env.VITEST !== 'true' && process.env.WEB_ONLY !== 'true'

export default defineConfig({
  plugins: [
    react(),
    enableElectron
      ? electron({
          main: {
            entry: 'electron/main.ts',
            vite: {
              build: {
                outDir: 'dist-electron',
                rollupOptions: {
                  external: ['better-sqlite3', 'electron', '@sentry/electron/main', 'electron-updater'],
                },
              },
            },
          },
          preload: {
            input: 'electron/preload.ts',
            vite: {
              build: {
                outDir: 'dist-electron',
              },
            },
          },
          renderer: {},
        })
      : null,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
