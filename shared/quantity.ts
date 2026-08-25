export const QUANTITY_DECIMALS = 5

export function roundQuantity(value: number): number {
  const factor = 10 ** QUANTITY_DECIMALS
  return Math.round((value + Number.EPSILON) * factor) / factor
}
