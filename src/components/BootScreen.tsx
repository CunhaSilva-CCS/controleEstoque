import { BRAND } from '../lib/branding'

export function BootScreen() {
  return (
    <div className="boot-screen" data-testid="boot-screen">
      <div className="boot-card">
        <img src={BRAND.logoSrc} alt={BRAND.company} className="boot-logo" />
        <p className="boot-eyebrow">{BRAND.productLine}</p>
        <h1 className="boot-title">{BRAND.module}</h1>
        <div className="boot-spinner" aria-hidden />
        <p className="boot-status">Carregando…</p>
      </div>
    </div>
  )
}
