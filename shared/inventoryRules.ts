/**
 * Regras puras de estoque — testáveis sem Electron/SQLite.
 * Espelham RF-05 / fluxos F4–F6 em docs/FLUXOS.md
 */

export class InventoryRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryRuleError';
  }
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new InventoryRuleError('A quantidade deve ser maior que zero.');
  }
}

export function assertNonNegativeQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new InventoryRuleError('A quantidade não pode ser negativa.');
  }
}

export function assertActiveProduct(active: boolean): void {
  if (!active) {
    throw new InventoryRuleError('Não é permitido movimentar produto inativo.');
  }
}

/** Custo médio ponderado após uma entrada (F4). */
export function weightedAverageCost(
  balanceBefore: number,
  currentCost: number,
  entryQty: number,
  entryUnitCost: number,
): number {
  assertNonNegativeQuantity(balanceBefore);
  assertPositiveQuantity(entryQty);
  if (!Number.isFinite(entryUnitCost) || entryUnitCost < 0) {
    throw new InventoryRuleError('Custo unitário inválido.');
  }
  if (balanceBefore === 0) {
    return roundMoney(entryUnitCost);
  }
  const total = balanceBefore * currentCost + entryQty * entryUnitCost;
  return roundMoney(total / (balanceBefore + entryQty));
}

export function applyEntry(balanceBefore: number, quantity: number): number {
  assertPositiveQuantity(quantity);
  assertNonNegativeQuantity(balanceBefore);
  return roundQty(balanceBefore + quantity);
}

export function applyExit(balanceBefore: number, quantity: number): number {
  assertPositiveQuantity(quantity);
  assertNonNegativeQuantity(balanceBefore);
  if (quantity > balanceBefore + 1e-9) {
    throw new InventoryRuleError(
      `Estoque insuficiente. Disponível: ${formatQty(balanceBefore)}, solicitado: ${formatQty(quantity)}.`,
    );
  }
  return roundQty(balanceBefore - quantity);
}

export function applyAdjust(balanceBefore: number, newQuantity: number): {
  balanceAfter: number;
  delta: number;
  quantityRecorded: number;
} {
  assertNonNegativeQuantity(balanceBefore);
  assertNonNegativeQuantity(newQuantity);
  const balanceAfter = roundQty(newQuantity);
  const delta = roundQty(balanceAfter - balanceBefore);
  return {
    balanceAfter,
    delta,
    quantityRecorded: Math.abs(delta),
  };
}

export function isLowStock(quantityOnHand: number, minStock: number): boolean {
  return quantityOnHand <= minStock;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function formatQty(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function validateProductFields(input: {
  sku: string;
  name: string;
  min_stock: number;
  cost_price: number;
  sale_price: number;
}): void {
  if (!input.sku?.trim()) {
    throw new InventoryRuleError('SKU é obrigatório.');
  }
  if (!input.name?.trim()) {
    throw new InventoryRuleError('Nome do produto é obrigatório.');
  }
  if (!Number.isFinite(input.min_stock) || input.min_stock < 0) {
    throw new InventoryRuleError('Estoque mínimo inválido.');
  }
  if (!Number.isFinite(input.cost_price) || input.cost_price < 0) {
    throw new InventoryRuleError('Custo unitário inválido.');
  }
  if (!Number.isFinite(input.sale_price) || input.sale_price < 0) {
    throw new InventoryRuleError('Preço de venda inválido.');
  }
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (cell: string | number | null | undefined): string => {
    const raw = cell == null ? '' : String(cell);
    if (/[;"\n]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  // BOM para Excel BR
  return `\uFEFF${lines.join('\n')}`;
}
