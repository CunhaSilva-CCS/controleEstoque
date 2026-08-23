export const PRODUCT_TYPES = [
  { value: 'materia_prima', label: 'Matéria-prima' },
  { value: 'produto_final', label: 'Produto final' },
  { value: 'insumo', label: 'Insumo' },
  { value: 'revenda', label: 'Revenda' },
] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]['value']

export const MATERIAL_PRODUCT_TYPES: ProductType[] = ['materia_prima', 'insumo']
export const FINISHED_PRODUCT_TYPES: ProductType[] = ['produto_final']

export function isProductType(value: string): value is ProductType {
  return PRODUCT_TYPES.some((t) => t.value === value)
}

export function productTypeLabel(type: ProductType | string): string {
  return PRODUCT_TYPES.find((t) => t.value === type)?.label ?? type
}
