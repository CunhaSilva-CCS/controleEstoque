import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { StatusBadge } from '../components/StatusBadge'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatNumber, productKindLabel } from '../lib/format'
import { CUSTOM_UNIT_VALUE, isKnownUnit, PRODUCT_UNITS } from '../lib/units'
import { useToast } from '../lib/toast'
import type { Category, Product, ProductKind, Supplier } from '@shared/types'

type ProductForm = {
  sku: string
  name: string
  description: string
  categoryId: string
  supplierId: string
  kind: ProductKind
  unit: string
  costPrice: string
  salePrice: string
  minStock: string
}

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  supplierId: '',
  kind: 'insumo',
  unit: 'un',
  costPrice: '0',
  salePrice: '0',
  minStock: '0',
}

export function ProductsPage() {
  const navigate = useNavigate()
  const { push } = useToast()
  const [params, setParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1')
  const [showInactive, setShowInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)

  const load = useCallback(async () => {
    try {
      const [plist, clist, slist] = await Promise.all([
        unwrap(api.listProducts({
          search,
          categoryId: categoryId || undefined,
          active: showInactive ? undefined : true,
          lowStockOnly: lowOnly || undefined,
        })),
        unwrap(api.listCategories(true)),
        unwrap(api.listSuppliers(true)),
      ])
      setProducts(plist)
      setCategories(clist)
      setSuppliers(slist)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao listar produtos', 'err')
    }
  }, [search, categoryId, lowOnly, showInactive, push])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (lowOnly) setParams({ low: '1' })
    else setParams({})
  }, [lowOnly, setParams])

  const title = useMemo(
    () => (editing ? 'Editar produto' : 'Novo produto'),
    [editing],
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      sku: p.sku,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId ?? '',
      supplierId: p.supplierId ?? '',
      kind: p.kind,
      unit: p.unit,
      costPrice: String(p.costPrice),
      salePrice: String(p.salePrice),
      minStock: String(p.minStock),
    })
    setOpen(true)
  }

  async function saveProduct(e: FormEvent) {
    e.preventDefault()
    try {
      const payload = {
        sku: form.sku,
        name: form.name,
        description: form.description,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        kind: form.kind,
        unit: form.unit,
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        minStock: Number(form.minStock),
      }
      if (editing) {
        await unwrap(api.updateProduct({ id: editing.id, ...payload }))
        push('Produto atualizado')
      } else {
        await unwrap(api.createProduct(payload))
        push('Produto cadastrado')
      }
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao salvar', 'err')
    }
  }

  async function toggleActive(p: Product) {
    try {
      await unwrap(api.setProductActive(p.id, !p.active))
      push(p.active ? 'Produto inativado' : 'Produto reativado')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao alterar status', 'err')
    }
  }

  return (
    <div data-testid="products-page">
      <div className="page-header">
        <p>Cadastro de insumos e produtos finais. Estoque entra por fatura ou fabricação.</p>
        <button className="btn btn-primary" data-testid="btn-new-product" onClick={openCreate}>
          Novo produto
        </button>
      </div>

      <div className="toolbar">
        <div className="field-inline filter-grow">
          <label htmlFor="search">Buscar</label>
          <input
            id="search"
            placeholder="Nome ou código"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field-inline">
          <label htmlFor="cat">Categoria</label>
          <select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="check-chip">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          Só estoque baixo
        </label>
        <label className="check-chip">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Incluir inativos
        </label>
      </div>

      <div className="panel panel-flush">
        {products.length === 0 ? (
          <div className="empty">Nenhum produto encontrado</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Unid.</th>
                  <th>Categoria</th>
                  <th>Saldo</th>
                  <th>Mín.</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>
                      {p.name}
                      {!p.active ? <span className="muted"> · inativo</span> : null}
                    </td>
                    <td>{productKindLabel(p.kind)}</td>
                    <td>{p.unit}</td>
                    <td>{p.categoryName ?? '—'}</td>
                    <td>
                      {formatNumber(p.stock)} {p.unit}
                    </td>
                    <td>{formatNumber(p.minStock)}</td>
                    <td>{formatCurrency(p.stockValue ?? 0)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost" onClick={() => openEdit(p)}>
                          Editar
                        </button>
                        <button className="btn btn-danger" onClick={() => void toggleActive(p)}>
                          {p.active ? 'Inativar' : 'Reativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <ModalForm
          title={title}
          hint={
            editing
              ? 'A edição cadastral não altera o saldo.'
              : 'Insumos entram no estoque por fatura. Produtos finais entram pela fabricação.'
          }
          onClose={() => setOpen(false)}
          onSubmit={saveProduct}
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sku">Código *</label>
              <input
                id="sku" data-testid="input-product-sku"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="unit">Unidade *</label>
              <select
                id="unit"
                data-testid="select-product-unit"
                required
                value={isKnownUnit(form.unit) ? form.unit : CUSTOM_UNIT_VALUE}
                onChange={(e) => {
                  const next = e.target.value
                  if (next === CUSTOM_UNIT_VALUE) {
                    setForm({ ...form, unit: isKnownUnit(form.unit) ? '' : form.unit })
                    return
                  }
                  setForm({ ...form, unit: next })
                }}
              >
                {PRODUCT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
                <option value={CUSTOM_UNIT_VALUE}>Outra (informar sigla)</option>
              </select>
              {!isKnownUnit(form.unit) ? (
                <input
                  data-testid="input-product-unit"
                  required
                  placeholder="Ex.: ton, bd, fardo"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="unit-custom-input"
                />
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="kind">Tipo *</label>
              <select
                id="kind"
                data-testid="select-product-kind"
                required
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as ProductKind })}
              >
                <option value="insumo">Insumo</option>
                <option value="acabado">Produto final</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="name">Nome *</label>
              <input
                id="name" data-testid="input-product-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="desc">Descrição</label>
              <textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="field">
              <div className="field-label-actions">
                <label htmlFor="pcat">Categoria</label>
                <button type="button" className="field-link" onClick={() => navigate('/categorias')}>Abrir categorias</button>
              </div>
              <select
                id="pcat"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="field-label-actions">
                <label htmlFor="psup">Fornecedor</label>
                <button type="button" className="field-link" onClick={() => navigate('/fornecedores')}>Abrir fornecedores</button>
              </div>
              <select
                id="psup"
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cost">Preço de custo *</label>
              <input
                id="cost" data-testid="input-product-cost"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sale">Preço de venda</label>
              <input
                id="sale" data-testid="input-product-sale"
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="min">Estoque mínimo *</label>
              <input
                id="min" data-testid="input-product-min"
                type="number"
                min="0"
                step="0.001"
                required
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
