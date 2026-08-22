import { useCallback, useEffect, useState } from 'react';
import { Modal, Toast, useToast } from '../components/ui';
import { getInventoryApi } from '../lib/api';
import { formatDateTime, formatNumber, unwrap } from '../lib/format';
import type {
  ExitReason,
  MovementType,
  Product,
  StockMovement,
  Supplier,
} from '../types/inventory';

type FormState = {
  type: MovementType;
  product_id: number | '';
  quantity: number;
  new_quantity: number;
  unit_cost: number | '';
  supplier_id: number | '';
  reason: ExitReason | string;
  notes: string;
};

const initial: FormState = {
  type: 'ENTRADA',
  product_id: '',
  quantity: 1,
  new_quantity: 0,
  unit_cost: '',
  supplier_id: '',
  reason: 'VENDA',
  notes: '',
};

export function MovementsPage() {
  const api = getInventoryApi();
  const { showOk, showError, toast } = useToast();
  const [items, setItems] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [typeFilter, setTypeFilter] = useState<MovementType | ''>('');
  const [productFilter, setProductFilter] = useState<number | ''>('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initial);

  const load = useCallback(async () => {
    try {
      const [movs, prods, sups] = await Promise.all([
        unwrap(
          api.listMovements({
            type: typeFilter || undefined,
            product_id: productFilter || null,
          }),
        ),
        unwrap(api.listProducts()),
        unwrap(api.listSuppliers()),
      ]);
      setItems(movs);
      setProducts(prods);
      setSuppliers(sups);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar movimentos');
    }
  }, [api, productFilter, showError, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    try {
      if (!form.product_id) {
        showError('Selecione um produto.');
        return;
      }
      if (form.type === 'ENTRADA') {
        await unwrap(
          api.createMovement({
            type: 'ENTRADA',
            product_id: Number(form.product_id),
            quantity: Number(form.quantity),
            unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
            supplier_id: form.supplier_id === '' ? null : Number(form.supplier_id),
            notes: form.notes || null,
          }),
        );
      } else if (form.type === 'SAIDA') {
        await unwrap(
          api.createMovement({
            type: 'SAIDA',
            product_id: Number(form.product_id),
            quantity: Number(form.quantity),
            reason: form.reason as ExitReason,
            notes: form.notes || null,
          }),
        );
      } else {
        await unwrap(
          api.createMovement({
            type: 'AJUSTE',
            product_id: Number(form.product_id),
            new_quantity: Number(form.new_quantity),
            reason: String(form.reason),
            notes: form.notes || null,
          }),
        );
      }
      showOk('Movimentação registrada.');
      setOpen(false);
      setForm(initial);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Falha na movimentação');
    }
  }

  const selected = products.find((p) => p.id === form.product_id);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className="page-header">
        <div>
          <h1>Movimentos</h1>
          <p>Entrada (F4), saída (F5) e ajuste (F6) — histórico append-only.</p>
        </div>
        <button
          type="button"
          className="btn"
          id="btn-nova-movimentacao"
          data-testid="nova-movimentacao"
          onClick={() => {
            setForm(initial);
            setOpen(true);
          }}
        >
          Nova movimentação
        </button>
      </div>

      <div className="toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as MovementType | '')}>
          <option value="">Todos os tipos</option>
          <option value="ENTRADA">ENTRADA</option>
          <option value="SAIDA">SAIDA</option>
          <option value="AJUSTE">AJUSTE</option>
        </select>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Todos os produtos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Antes → Depois</th>
              <th>Motivo</th>
              <th>Usuário</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td>{formatDateTime(m.created_at)}</td>
                <td>
                  <span className={`badge ${m.type.toLowerCase()}`}>{m.type}</span>
                </td>
                <td>
                  {m.product_sku}
                  <br />
                  <span style={{ color: 'var(--ink-muted)' }}>{m.product_name}</span>
                </td>
                <td>{formatNumber(m.quantity)}</td>
                <td>
                  {formatNumber(m.balance_before)} → {formatNumber(m.balance_after)}
                </td>
                <td>{m.reason || '—'}</td>
                <td>{m.user_label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {open && (
        <Modal title="Nova movimentação" onClose={() => setOpen(false)}>
          <div className="form-grid">
            <label>
              Tipo
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    type: e.target.value as MovementType,
                    reason: e.target.value === 'SAIDA' ? 'VENDA' : e.target.value === 'AJUSTE' ? '' : 'ENTRADA',
                  })
                }
              >
                <option value="ENTRADA">ENTRADA</option>
                <option value="SAIDA">SAIDA</option>
                <option value="AJUSTE">AJUSTE</option>
              </select>
            </label>
            <label>
              Produto
              <select
                value={form.product_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    product_id: e.target.value ? Number(e.target.value) : '',
                    new_quantity: products.find((p) => p.id === Number(e.target.value))?.quantity_on_hand ?? 0,
                  })
                }
              >
                <option value="">Selecione…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} (saldo {formatNumber(p.quantity_on_hand)})
                  </option>
                ))}
              </select>
            </label>

            {form.type !== 'AJUSTE' ? (
              <label>
                Quantidade
                <input
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                />
              </label>
            ) : (
              <label>
                Novo saldo absoluto
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.new_quantity}
                  onChange={(e) => setForm({ ...form, new_quantity: Number(e.target.value) })}
                />
              </label>
            )}

            {form.type === 'ENTRADA' && (
              <>
                <label>
                  Fornecedor
                  <select
                    value={form.supplier_id}
                    onChange={(e) =>
                      setForm({ ...form, supplier_id: e.target.value ? Number(e.target.value) : '' })
                    }
                  >
                    <option value="">—</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Custo unitário (opc.)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.unit_cost}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        unit_cost: e.target.value === '' ? '' : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}

            {form.type === 'SAIDA' && (
              <label>
                Motivo
                <select
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                >
                  <option value="VENDA">VENDA</option>
                  <option value="USO_INTERNO">USO_INTERNO</option>
                  <option value="PERDA">PERDA</option>
                  <option value="OUTRO">OUTRO</option>
                </select>
              </label>
            )}

            {form.type === 'AJUSTE' && (
              <label className="full">
                Motivo do ajuste
                <input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Ex.: contagem física 22/08"
                />
              </label>
            )}

            <label className="full">
              Observação
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
          {selected && (
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
              Saldo atual de {selected.name}: <strong>{formatNumber(selected.quantity_on_hand)}</strong>
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={() => void submit()}>
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
