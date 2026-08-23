export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function statusLabel(status: string): string {
  if (status === 'zero') return 'Zerado'
  if (status === 'low') return 'Baixo'
  return 'OK'
}

export function movementLabel(type: string): string {
  if (type === 'entrada') return 'Entrada'
  if (type === 'saida') return 'Saída'
  return 'Ajuste'
}

export { productTypeLabel } from '@shared/product-types'
