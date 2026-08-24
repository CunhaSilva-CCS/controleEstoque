export const QUANTITY_DECIMALS = 3

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000
}

