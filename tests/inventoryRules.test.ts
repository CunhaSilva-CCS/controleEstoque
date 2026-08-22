import { describe, expect, it } from 'vitest';
import {
  InventoryRuleError,
  applyAdjust,
  applyEntry,
  applyExit,
  isLowStock,
  toCsv,
  validateProductFields,
  weightedAverageCost,
} from '../shared/inventoryRules';

describe('regras de estoque', () => {
  it('aplica entrada somando saldo', () => {
    expect(applyEntry(10, 5)).toBe(15);
  });

  it('rejeita saída maior que o saldo', () => {
    expect(() => applyExit(3, 5)).toThrow(InventoryRuleError);
    expect(() => applyExit(3, 5)).toThrow(/Estoque insuficiente/);
  });

  it('aplica saída válida', () => {
    expect(applyExit(10, 4)).toBe(6);
  });

  it('calcula ajuste com delta', () => {
    expect(applyAdjust(10, 7)).toEqual({
      balanceAfter: 7,
      delta: -3,
      quantityRecorded: 3,
    });
  });

  it('calcula custo médio ponderado', () => {
    // 10 un a 2,00 + 10 un a 4,00 = média 3,00
    expect(weightedAverageCost(10, 2, 10, 4)).toBe(3);
  });

  it('usa custo da entrada quando saldo era zero', () => {
    expect(weightedAverageCost(0, 0, 5, 12.5)).toBe(12.5);
  });

  it('detecta estoque baixo', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });

  it('valida campos obrigatórios do produto', () => {
    expect(() =>
      validateProductFields({ sku: '', name: 'X', min_stock: 0, cost_price: 0, sale_price: 0 }),
    ).toThrow(/SKU/);
  });

  it('gera CSV com separador ; e BOM', () => {
    const csv = toCsv(['A', 'B'], [['1', 'dois;com;ponto']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('A;B');
    expect(csv).toContain('"dois;com;ponto"');
  });
});
