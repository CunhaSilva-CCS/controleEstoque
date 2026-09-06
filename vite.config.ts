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
              // O processo empacotado não herda as variáveis de ambiente do build (CI),
              // então SENTRY_DSN/SENTRY_ENVIRONMENT precisam ser gravados no bundle aqui.
              define: {
                'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
                'process.env.SENTRY_ENVIRONMENT': JSON.stringify(process.env.SENTRY_ENVIRONMENT ?? ''),
              },
              build: {
                outDir: 'dist-electron',
                // vite-plugin-electron 1.x lê `rolldownOptions` no Vite 8+ e `rollupOptions` no Vite < 8
                // (a própria config padrão do plugin já é migrada por versão, mas a nossa não é
                // convertida automaticamente); declaramos as duas chaves para funcionar nas duas.
                rollupOptions: {
                  external: ['better-sqlite3-multiple-ciphers', 'electron', '@sentry/electron/main', 'electron-updater'],
                },
                rolldownOptions: {
                  external: ['better-sqlite3-multiple-ciphers', 'electron', '@sentry/electron/main', 'electron-updater'],
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
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
  },
})
