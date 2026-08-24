import { app } from 'electron'

type SentryMain = typeof import('@sentry/electron/main')

let enabled = false
let Sentry: SentryMain | null = null

function isTelemetryEnabled(): boolean {
  if (!process.env.SENTRY_DSN) return false
  if (app.isPackaged) return true
  return process.env.SENTRY_ENABLED === 'true'
}

/** Inicializa Sentry no processo main (no-op sem SENTRY_DSN). */
export function initMainTelemetry(): void {
  if (!isTelemetryEnabled()) return

  // Lazy load: @sentry/electron/main touches electron.app at import time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Sentry = require('@sentry/electron/main') as SentryMain

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? (app.isPackaged ? 'production' : 'development'),
    release: `cortexis-tech-erp-estoque@${app.getVersion()}`,
    attachScreenshot: false,
  })

  enabled = true
}

export function registerProcessErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    captureError(error, { source: 'uncaughtException' })
  })

  process.on('unhandledRejection', (reason) => {
    captureError(reason, { source: 'unhandledRejection' })
  })
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) {
    if (context) console.error('[telemetry]', error, context)
    else console.error('[telemetry]', error)
    return
  }

  Sentry!.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value)
      }
    }
    Sentry!.captureException(error)
  })
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!enabled) return
  Sentry!.captureMessage(message, level)
}
