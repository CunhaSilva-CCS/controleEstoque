import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../components/ModalForm'
import { QuickProductModal } from '../components/QuickProductModal'
import { api, unwrap } from '../lib/api'
import { formatDateTime, formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { ManufacturingOrder, Product, ProductRecipeItem } from '@shared/types'

type RecipeDraft = {
  key: string
  materialProductId: string
  quantity: string
}

function newRecipeRow(products: Product[], excludeId: string): RecipeDraft {
  const material = products.find((p) => p.id !== excludeId)
  return {
    key: crypto.randomUUID(),
    materialProductId: material?.id ?? '',
    quantity: '1',
  }
}

export function ManufacturingPage() {
  const { push } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<ManufacturingOrder[]>([])
  const [finishedProductId, setFinishedProductId] = useState('')
  const [recipe, setRecipe] = useState<ProductRecipeItem[]>([])
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft[]>([])
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [produceOpen, setProduceOpen] = useState(false)
  const [produceQty, setProduceQty] = useState('1')
  const [produceNotes, setProduceNotes] = useState('')
  const [productModalOpen, setProductModalOpen] = useState(false)

  const finishedProduct = products.find((p) => p.id === finishedProductId)
  const materials = products.filter((p) => p.id !== finishedProductId)

  const load = useCallback(async () => {
    try {
      const [prods, list] = await Promise.all([
        unwrap(api.listProducts({ active: true })),
        unwrap(api.listManufacturingOrders()),
      ])
      setProducts(prods)
      setOrders(list)
      if (!finishedProductId && prods[0]) {
        setFinishedProductId(prods[0].id)
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar fabricação', 'err')
    }
  }, [finishedProductId, push])

  const loadRecipe = useCallback(async (productId: string) => {
    if (!productId) {
      setRecipe([])
      return
    }
    try {
      const items = await unwrap(api.getProductRecipe(productId))
      setRecipe(items)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar ficha técnica', 'err')
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadRecipe(finishedProductId)
  }, [finishedProductId, loadRecipe])

  function openRecipeEditor() {
    if (!finishedProductId) return
    setRecipeDraft(
      recipe.length
        ? recipe.map((item) => ({
            key: item.id,
            materialProductId: item.materialProductId,
            quantity: String(item.quantity),
          }))
        : [newRecipeRow(products, finishedProductId)],
    )
    setRecipeOpen(true)
  }

  function updateDraft(key: string, patch: Partial<RecipeDraft>) {
    setRecipeDraft((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addDraftRow() {
    setRecipeDraft((prev) => [...prev, newRecipeRow(products, finishedProductId)])
  }

  function removeDraftRow(key: string) {
    setRecipeDraft((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  async function saveRecipe(e: FormEvent) {
    e.preventDefault()
    if (!finishedProductId) return
    try {
      await unwrap(
        api.saveProductRecipe({
          finishedProductId,
          items: recipeDraft.map((row) => ({
            materialProductId: row.materialProductId,
            quantity: Number(row.quantity) || 0,
          })),
        }),
      )
      push('Ficha técnica salva')
      setRecipeOpen(false)
      await loadRecipe(finishedProductId)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao salvar ficha técnica', 'err')
    }
  }

  async function produce(e: FormEvent) {
    e.preventDefault()
    try {
      await unwrap(
        api.createManufacturingOrder({
          finishedProductId,
          quantity: Number(produceQty) || 0,
          notes: produceNotes,
        }),
      )
      push('Fabricação registrada — matérias-primas baixadas e produto acabado entrado')
      setProduceOpen(false)
      setProduceQty('1')
      setProduceNotes('')
      await Promise.all([load(), loadRecipe(finishedProductId)])
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao registrar fabricação', 'err')
    }
  }

  function handleProductCreated(product: Product) {
    setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)))
    setFinishedProductId(product.id)
  }

  const batchQty = Number(produceQty) || 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Fabricação</h2>
          <p>Baixa automática de matérias-primas e entrada do produto acabado</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setProductModalOpen(true)}>
            Novo produto
          </button>
          <button
            className="btn btn-ghost"
            onClick={openRecipeEditor}
            disabled={!finishedProductId || materials.length === 0}
          >
            Ficha técnica
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setProduceOpen(true)}
            disabled={!finishedProductId || recipe.length === 0}
          >
            Registrar fabricação
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="field-inline">
          <label htmlFor="finished">Produto acabado</label>
          <select
            id="finished"
            value={finishedProductId}
            onChange={(e) => setFinishedProductId(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name} (saldo: {formatNumber(p.stock)} {p.unit})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel">
        <h3>Ficha técnica</h3>
        {recipe.length === 0 ? (
          <div className="empty">
            Nenhuma matéria-prima cadastrada. Use &quot;Ficha técnica&quot; para definir a composição.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Matéria-prima</th>
                  <th>Qtd por unidade</th>
                  <th>Saldo atual</th>
                </tr>
              </thead>
              <tbody>
                {recipe.map((item) => (
                  <tr key={item.id}>
                    <td>{item.materialSku}</td>
                    <td>{item.materialName}</td>
                    <td>
                      {formatNumber(item.quantity)} {item.materialUnit}
                    </td>
                    <td>
                      {formatNumber(item.materialStock ?? 0)} {item.materialUnit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 0, marginTop: '1rem' }}>
        <h3 style={{ padding: '1rem 1rem 0' }}>Histórico de fabricação</h3>
        {orders.length === 0 ? (
          <div className="empty">Nenhuma ordem de fabricação registrada</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td>{order.finishedProductSku}</td>
                    <td>{order.finishedProductName}</td>
                    <td>{formatNumber(order.quantity)}</td>
                    <td>{order.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recipeOpen ? (
        <ModalForm
          title={`Ficha técnica — ${finishedProduct?.name ?? ''}`}
          hint="Quantidade de matéria-prima consumida por 1 unidade do produto acabado"
          onClose={() => setRecipeOpen(false)}
          onSubmit={saveRecipe}
          submitLabel="Salvar ficha"
        >
          {recipeDraft.map((row, index) => (
            <div key={row.key} className="form-grid item-row">
              <div className="field full">
                <label htmlFor={`mat-${row.key}`}>Matéria-prima *</label>
                <select
                  id={`mat-${row.key}`}
                  required
                  value={row.materialProductId}
                  onChange={(e) => updateDraft(row.key, { materialProductId: e.target.value })}
                >
                  {materials.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`rqty-${row.key}`}>Qtd por unidade *</label>
                <input
                  id={`rqty-${row.key}`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={row.quantity}
                  onChange={(e) => updateDraft(row.key, { quantity: e.target.value })}
                />
              </div>
              {recipeDraft.length > 1 ? (
                <div className="field" style={{ alignSelf: 'end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => removeDraftRow(row.key)}>
                    Remover
                  </button>
                </div>
              ) : null}
              {index < recipeDraft.length - 1 ? (
                <div className="field full">
                  <hr />
                </div>
              ) : null}
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={addDraftRow}>
            + Adicionar matéria-prima
          </button>
        </ModalForm>
      ) : null}

      {produceOpen ? (
        <ModalForm
          title={`Fabricar — ${finishedProduct?.name ?? ''}`}
          hint={
            recipe.length
              ? `Será produzido ${formatNumber(batchQty)} un. Matérias-primas serão baixadas automaticamente.`
              : undefined
          }
          onClose={() => setProduceOpen(false)}
          onSubmit={produce}
          submitLabel="Confirmar fabricação"
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pqty">Quantidade produzida *</label>
              <input
                id="pqty"
                type="number"
                min="0.001"
                step="0.001"
                required
                value={produceQty}
                onChange={(e) => setProduceQty(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="pnotes">Observações</label>
              <input id="pnotes" value={produceNotes} onChange={(e) => setProduceNotes(e.target.value)} />
            </div>
          </div>
          {batchQty > 0 && recipe.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Matéria-prima</th>
                    <th>Necessário</th>
                    <th>Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.map((item) => {
                    const required = item.quantity * batchQty
                    const available = item.materialStock ?? 0
                    const ok = required <= available
                    return (
                      <tr key={item.id} className={ok ? undefined : 'row-warn'}>
                        <td>{item.materialName}</td>
                        <td>
                          {formatNumber(required)} {item.materialUnit}
                        </td>
                        <td>
                          {formatNumber(available)} {item.materialUnit}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </ModalForm>
      ) : null}

      <QuickProductModal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        onCreated={handleProductCreated}
        zeroInitialStock
      />
    </div>
  )
}
