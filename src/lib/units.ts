export type ProductUnitOption = {
  value: string
  label: string
}

/** Unidades comuns para cadastro de produtos. */
export const PRODUCT_UNITS: ProductUnitOption[] = [
  { value: 'un', label: 'Unidade (un)' },
  { value: 'pct', label: 'Pacote (pct)' },
  { value: 'cx', label: 'Caixa (cx)' },
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'g', label: 'Grama (g)' },
  { value: 'L', label: 'Litro (L)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'm', label: 'Metro (m)' },
  { value: 'cm', label: 'Centímetro (cm)' },
  { value: 'dz', label: 'Dúzia (dz)' },
  { value: 'par', label: 'Par (par)' },
  { value: 'rl', label: 'Rolo (rl)' },
]

export const CUSTOM_UNIT_VALUE = '__custom__'

export function isKnownUnit(unit: string): boolean {
  return PRODUCT_UNITS.some((u) => u.value === unit)
}

export function unitLabel(unit: string): string {
  return PRODUCT_UNITS.find((u) => u.value === unit)?.label ?? unit
}
