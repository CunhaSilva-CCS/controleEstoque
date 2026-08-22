import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { StatusBadge } from '../components/StatusBadge'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Category, Product, Supplier } from '@shared/types'

type ProductForm = {
  sku: string
  name: string
  description: string
  categoryId: string
  supplierId: string
  unit: string
  costPrice: string
  salePrice: string
  minStock: string
  initialStock: string
}

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  supplierId: '',
  unit: 'un',
  costPrice: '0',
  salePrice: '0',
  minStock: '0',
  initialStock: '0',
}

export function ProductsPage() {
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
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveProduct, setMoveProduct] = useState<Product | null>(null)
  const [moveType, setMoveType] = useState<'entrada' | 'saida' | 'ajuste'>('entrada')
  const [moveQty, setMoveQty] = useState('1')
  const [moveNewStock, setMoveNewStock] = useState('0')
  const [moveReason, setMoveReason] = useState('')
  const [moveRef, setMoveRef] = useState('')

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
      unit: p.unit,
      costPrice: String(p.costPrice),
      salePrice: String(p.salePrice),
      minStock: String(p.minStock),
      initialStock: '0',
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
        unit: form.unit,
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        minStock: Number(form.minStock),
      }
      if (editing) {
        await unwrap(api.updateProduct({ id: editing.id, ...payload }))
        push('Produto atualizado')
      } else {
        await unwrap(
          api.createProduct({
            ...payload,
            initialStock: Number(form.initialStock) || 0,
          }),
        )
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

  function openMove(p: Product) {
    setMoveProduct(p)
    setMoveType('entrada')
    setMoveQty('1')
    setMoveNewStock(String(p.stock))
    setMoveReason('')
    setMoveRef('')
    setMoveOpen(true)
  }

  async function saveMove(e: FormEvent) {
    e.preventDefault()
    if (!moveProduct) return
    try {
      await unwrap(
        api.createMovement({
          productId: moveProduct.id,
          type: moveType,
          quantity: Number(moveQty) || 0,
          newStock: moveType === 'ajuste' ? Number(moveNewStock) : undefined,
          reason: moveReason,
          reference: moveRef,
        }),
      )
      push('Movimentação registrada')
      setMoveOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha na movimentação', 'err')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Produtos</h2>
          <p>Cadastro, saldos e status de estoque</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          Novo produto
        </button>
      </div>

      <div className="toolbar">
        <div className="field-inline" style={{ minWidth: 220, flex: 1 }}>
          <label htmlFor="search">Buscar</label>
          <input
            id="search"
            placeholder="Nome ou SKU"
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
        <label className="field-inline" style={{ justifyContent: 'flex-end' }}>
          <span>&nbsp;</span>
          <span className="btn btn-ghost" style={{ display: 'inline-flex', gap: 8 }}>
            <input
              type="checkbox"
              checked={lowOnly}
              onChange={(e) => setLowOnly(e.target.checked)}
            />
            Só estoque baixo
          </span>
        </label>
        <label className="field-inline" style={{ justifyContent: 'flex-end' }}>
          <span>&nbsp;</span>
          <span className="btn btn-ghost" style={{ display: 'inline-flex', gap: 8 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Incluir inativos
          </span>
        </label>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {products.length === 0 ? (
          <div className="empty">Nenhum produto encontrado</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nome</th>
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
                        {p.active ? (
                          <button className="btn btn-ghost" onClick={() => openMove(p)}>
                            Movimentar
                          </button>
                        ) : null}
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
              ? 'A edição cadastral não altera o saldo. Use movimentação para isso.'
              : 'SKU único. Estoque inicial gera entrada automática.'
          }
          onClose={() => setOpen(false)}
          onSubmit={saveProduct}
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sku">SKU *</label>
              <input
                id="sku"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="unit">Unidade *</label>
              <input
                id="unit"
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="name">Nome *</label>
              <input
                id="name"
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
              <label htmlFor="pcat">Categoria</label>
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
              <label htmlFor="psup">Fornecedor</label>
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
                id="cost"
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
                id="sale"
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
                id="min"
                type="number"
                min="0"
                step="0.001"
                required
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </div>
            {!editing ? (
              <div className="field">
                <label htmlFor="ini">Estoque inicial</label>
                <input
                  id="ini"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.initialStock}
                  onChange={(e) => setForm({ ...form, initialStock: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        </ModalForm>
      ) : null}

      {moveOpen && moveProduct ? (
        <ModalForm
          title={`Movimentar · ${moveProduct.name}`}
          hint={`Saldo atual: ${formatNumber(moveProduct.stock)} ${moveProduct.unit}`}
          onClose={() => setMoveOpen(false)}
          onSubmit={saveMove}
          submitLabel="Registrar"
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="mtype">Tipo</label>
              <select
                id="mtype"
                value={moveType}
                onChange={(e) => setMoveType(e.target.value as typeof moveType)}
              >
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="ajuste">Ajuste</option>
              </select>
            </div>
            {moveType === 'ajuste' ? (
              <div className="field">
                <label htmlFor="mnew">Novo saldo *</label>
                <input
                  id="mnew"
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  value={moveNewStock}
                  onChange={(e) => setMoveNewStock(e.target.value)}
                />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="mqty">Quantidade *</label>
                <input
                  id="mqty"
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={moveQty}
                  onChange={(e) => setMoveQty(e.target.value)}
                />
              </div>
            )}
            <div className="field full">
              <label htmlFor="mreason">Motivo *</label>
              <input
                id="mreason"
                required
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
                placeholder="Ex.: compra NF 123, venda balcão, inventário"
              />
            </div>
            <div className="field full">
              <label htmlFor="mref">Referência</label>
              <input
                id="mref"
                value={moveRef}
                onChange={(e) => setMoveRef(e.target.value)}
                placeholder="Documento, pedido, OS…"
              />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
