import { useCallback, useEffect, useState } from 'react';
import { Modal, Toast, useToast } from '../components/ui';
import { getInventoryApi } from '../lib/api';
import { formatMoney, formatNumber, unwrap } from '../lib/format';
import type { Category, Product, ProductInput, Supplier, Unit } from '../types/inventory';

const empty: ProductInput = {
  sku: '',
  name: '',
  description: '',
  category_id: null,
  supplier_id: null,
  unit: 'UN',
  min_stock: 0,
  cost_price: 0,
  sale_price: 0,
  location: '',
};

const UNITS: Unit[] = ['UN', 'KG', 'L', 'CX', 'MT'];

export function ProductsPage() {
  const api = getInventoryApi();
  const { showOk, showError, toast } = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductInput>(empty);

  const load = useCallback(async () => {
    try {
      const [products, cats, sups] = await Promise.all([
        unwrap(api.listProducts({ search, lowStockOnly: lowOnly, includeInactive })),
        unwrap(api.listCategories()),
        unwrap(api.listSuppliers()),
      ]);
      setItems(products);
      setCategories(cats);
      setSuppliers(sups);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar produtos');
    }
  }, [api, includeInactive, lowOnly, search, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    try {
      const payload: ProductInput = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        min_stock: Number(form.min_stock),
        cost_price: Number(form.cost_price),
        sale_price: Number(form.sale_price),
      };
      if (editing) {
        await unwrap(api.updateProduct(editing.id, payload));
        showOk('Produto atualizado. Estoque só muda via movimentos.');
      } else {
        await unwrap(api.createProduct(payload));
        showOk('Produto criado com saldo 0. Use Entrada para abastecer.');
      }
      setOpen(false);
      setEditing(null);
      setForm(empty);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className="page-header">
        <div>
          <h1>Produtos</h1>
          <p>Cadastro do catálogo (fluxo F3). Saldo apenas via movimentos.</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setEditing(null);
            setForm(empty);
            setOpen(true);
          }}
        >
          Novo produto
        </button>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar SKU ou nome"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Só críticos
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Incluir inativos
        </label>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Saldo</th>
              <th>Mín.</th>
              <th>Custo</th>
              <th>Venda</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.sku}</td>
                <td>
                  {p.name}
                  {!p.active && (
                    <>
                      {' '}
                      <span className="badge muted">Inativo</span>
                    </>
                  )}
                </td>
                <td>{p.category_name || '—'}</td>
                <td>
                  {p.is_low_stock ? (
                    <span className="badge warn">
                      {formatNumber(p.quantity_on_hand)} {p.unit}
                    </span>
                  ) : (
                    `${formatNumber(p.quantity_on_hand)} ${p.unit}`
                  )}
                </td>
                <td>{formatNumber(p.min_stock)}</td>
                <td>{formatMoney(p.cost_price)}</td>
                <td>{formatMoney(p.sale_price)}</td>
                <td>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setEditing(p);
                      setForm({
                        sku: p.sku,
                        name: p.name,
                        description: p.description,
                        category_id: p.category_id,
                        supplier_id: p.supplier_id,
                        unit: p.unit,
                        min_stock: p.min_stock,
                        cost_price: p.cost_price,
                        sale_price: p.sale_price,
                        location: p.location,
                      });
                      setOpen(true);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      void (async () => {
                        try {
                          await unwrap(api.setProductActive(p.id, !p.active));
                          showOk(p.active ? 'Produto desativado.' : 'Produto reativado.');
                          await load();
                        } catch (err) {
                          showError(err instanceof Error ? err.message : 'Falha');
                        }
                      })();
                    }}
                  >
                    {p.active ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {open && (
        <Modal title={editing ? 'Editar produto' : 'Novo produto'} onClose={() => setOpen(false)}>
          <div className="form-grid">
            <label>
              SKU
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </label>
            <label>
              Unidade
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Nome
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Categoria
              <select
                value={form.category_id ?? ''}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fornecedor preferencial
              <select
                value={form.supplier_id ?? ''}
                onChange={(e) =>
                  setForm({ ...form, supplier_id: e.target.value ? Number(e.target.value) : null })
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
              Estoque mínimo
              <input
                type="number"
                min={0}
                step="0.001"
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
              />
            </label>
            <label>
              Localização
              <input
                value={form.location ?? ''}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label>
              Custo unitário
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
              />
            </label>
            <label>
              Preço de venda
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
              />
            </label>
            <label className="full">
              Descrição
              <textarea
                rows={3}
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
          </div>
          {editing && (
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
              Saldo atual: <strong>{formatNumber(editing.quantity_on_hand)}</strong> (somente leitura aqui)
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={() => void save()}>
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
