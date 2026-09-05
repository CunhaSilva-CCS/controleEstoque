import type { LicenseDetails } from './types'

export const LICENSE_MODULE_IDS = [
  'compras',
  'vendas',
  'producao',
  'estoque',
  'financeiro',
  'relatorios-avancados',
  'multi-empresa',
] as const

export type LicenseModule = (typeof LICENSE_MODULE_IDS)[number]

export const LICENSE_MODULE_LABELS: Record<LicenseModule, string> = {
  compras: 'Compras',
  vendas: 'Vendas',
  producao: 'Produção / Fabrico',
  estoque: 'Estoque',
  financeiro: 'Financeiro',
  'relatorios-avancados': 'Relatórios avançados',
  'multi-empresa': 'Multi-empresa',
}

function isKnownModule(value: string): value is LicenseModule {
  return (LICENSE_MODULE_IDS as readonly string[]).includes(value)
}

/**
 * Licenças sem `modules` seguem a regra por edição (compatibilidade com chaves já emitidas):
 * professional libera tudo, standard libera só o núcleo (produtos/categorias/fornecedores/clientes,
 * que não são módulos licenciáveis). Licenças com `modules` explícito usam a lista à risca,
 * independentemente da edição.
 */
export function getEnabledModules(details: LicenseDetails): Set<LicenseModule> {
  if (details.modules) return new Set(details.modules.filter(isKnownModule))
  return details.edition === 'professional' ? new Set(LICENSE_MODULE_IDS) : new Set()
}

export function isModuleEnabled(details: LicenseDetails, moduleId: LicenseModule): boolean {
  return getEnabledModules(details).has(moduleId)
}
