import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InventoryRepository } from '../electron/db/repository';

describe('InventoryRepository (fluxos F3–F6)', () => {
  let repo: InventoryRepository;
  let tmpFile: string;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    tmpFile = path.join(os.tmpdir(), `estoque-test-${Date.now()}.sqlite`);
    const persist = (data: Uint8Array) => {
      fs.writeFileSync(tmpFile, Buffer.from(data));
    };
    // bootstrap sem seed: criar schema vazio
    db.run(`SELECT 1`);
    // Forçar bootstrap e depois limpar seed é complexo; usamos seed e trabalhamos em cima
    repo = InventoryRepository.bootstrap(
      db as unknown as ConstructorParameters<typeof InventoryRepository>[0],
      persist,
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('seed cria produtos com movimentos de entrada', () => {
    const products = repo.listProducts();
    expect(products.length).toBeGreaterThanOrEqual(5);
    expect(products.every((p) => p.quantity_on_hand > 0)).toBe(true);
    expect(repo.listMovements().length).toBeGreaterThanOrEqual(5);
  });

  it('rejeita saída maior que saldo', () => {
    const product = repo.listProducts()[0]!;
    expect(() =>
      repo.createMovement({
        type: 'SAIDA',
        product_id: product.id,
        quantity: product.quantity_on_hand + 100,
        reason: 'VENDA',
      }),
    ).toThrow(/Estoque insuficiente/);
  });

  it('entrada aumenta saldo e registra histórico', () => {
    const product = repo.listProducts()[0]!;
    const before = product.quantity_on_hand;
    const mov = repo.createMovement({
      type: 'ENTRADA',
      product_id: product.id,
      quantity: 2,
      unit_cost: product.cost_price,
      notes: 'teste',
    });
    expect(mov.balance_after).toBe(before + 2);
    const updated = repo.listProducts().find((p) => p.id === product.id)!;
    expect(updated.quantity_on_hand).toBe(before + 2);
  });

  it('ajuste define saldo absoluto', () => {
    const product = repo.listProducts()[0]!;
    const mov = repo.createMovement({
      type: 'AJUSTE',
      product_id: product.id,
      new_quantity: 1,
      reason: 'contagem',
    });
    expect(mov.balance_after).toBe(1);
    const updated = repo.listProducts().find((p) => p.id === product.id)!;
    expect(updated.quantity_on_hand).toBe(1);
  });

  it('produto novo nasce com saldo 0', () => {
    const created = repo.createProduct({
      sku: 'TST-001',
      name: 'Produto teste',
      unit: 'UN',
      min_stock: 2,
      cost_price: 1,
      sale_price: 2,
    });
    expect(created.quantity_on_hand).toBe(0);
    expect(created.is_low_stock).toBe(true);
  });

  it('exporta inventário CSV', () => {
    const csv = repo.exportInventoryCsv();
    expect(csv).toContain('SKU');
    expect(csv.length).toBeGreaterThan(20);
  });
});
