import { QUANTITY_DECIMALS } from '@shared/quantity'

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: QUANTITY_DECIMALS,
    maximumFractionDigits: QUANTITY_DECIMALS,
  })
}

export function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: QUANTITY_DECIMALS,
    maximumFractionDigits: QUANTITY_DECIMALS,
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export {
  statusLabel,
  movementLabel,
  productKindLabel,
  movementOriginLabel,
  roleLabel,
  operationStatusLabel,
  operationStatusBadgeClass,
  inventoryStatusLabel,
  inventoryStatusBadgeClass,
} from '@shared/labels'
