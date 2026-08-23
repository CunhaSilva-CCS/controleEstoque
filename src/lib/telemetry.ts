/** Inicializa Sentry no renderer quando rodando dentro do Electron empacotado. */
export function initRendererTelemetry(): void {
  const isElectron = typeof window !== 'undefined' && 'estoque' in window
  if (!isElectron) return

  void import('@sentry/electron/renderer').then(({ init }) => {
    init({})
  })
}
