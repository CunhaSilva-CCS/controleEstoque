import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { api, unwrap } from '../lib/api'
import { formatDateTime, formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Product, ProductionOrder, Recipe } from '@shared/types'

export function ProductionPage() {
  const navigate = useNavigate()
  const { push } = useToast()
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [finished, setFinished] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')

  const recipe = useMemo(
    () => recipes.find((r) => r.productId === productId),
    [recipes, productId],
  )

  const load = useCallback(async () => {
    try {
      const [olist, rlist, prods] = await Promise.all([
        unwrap(api.listProductionOrders()),
        unwrap(api.listRecipes()),
        unwrap(api.listProducts({ active: true, kind: 'acabado' })),
      ])
      setOrders(olist)
      setRecipes(rlist)
      const productsWithRecipe = new Set(rlist.filter((recipe) => recipe.active).map((recipe) => recipe.productId))
      setFinished(prods.filter((product) => productsWithRecipe.has(product.id)))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar registros de fabricação', 'err')
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setProductId(finished[0]?.id ?? '')
    setQuantity('1')
    setNotes('')
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await unwrap(
        api.createProduction({
          productId,
          quantity: Number(quantity) || 0,
          notes,
        }),
      )
      push('Fabricação registrada')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao registrar fabricação', 'err')
    }
  }

  return (
    <div className="collection-page production-page" data-testid="production-page">
      <CollectionPageHeader icon="⚙" description="Produção de itens finais com consumo automático dos insumos definidos na receita." count={orders.length} singular="fabricação registrada" plural="fabricações registradas">
        <button
          className="btn btn-primary"
          data-testid="btn-new-production"
          onClick={openCreate}
          disabled={finished.length === 0}
          title={finished.length === 0 ? 'Cadastre uma receita para habilitar a fabricação' : undefined}
        >
          <span aria-hidden>+</span>
          Registrar fabricação
        </button>
      </CollectionPageHeader>

      <div className="panel panel-flush">
        {orders.length === 0 ? (
          <CollectionEmpty icon="⚙" title="Nenhuma fabricação registrada" description="Registre uma fabricação para produzir itens finais e consumir insumos." />
        ) : (
          <div className="table-wrap">
            <table className="collection-table production-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  <th>Observações</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      {order.productSku} · {order.productName}
                    </td>
                    <td>{formatNumber(order.quantity)}</td>
                    <td>{order.notes || '—'}</td>
                    <td>{formatDateTime(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <ModalForm
          title="Registrar fabricação"
          hint={
            recipe
              ? `Receita: ${recipe.items.map((i) => `${i.productSku} (${formatNumber(i.quantity)})`).join(', ')}`
              : 'Cadastre a receita do produto final antes de fabricar'
          }
          onClose={() => setOpen(false)}
          onSubmit={save}
          submitLabel="Fabricar"
        >
          <div className="form-grid">
            <div className="field full">
              <div className="field-label-actions">
                <label htmlFor="prod-product">Produto final com receita *</label>
                <button type="button" className="field-link" onClick={() => navigate('/receitas')}>Abrir receitas</button>
              </div>
              <select
                id="prod-product"
                data-testid="select-production-product"
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {finished.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="prod-qty">Quantidade *</label>
              <input
                id="prod-qty"
                data-testid="input-production-qty"
                type="number"
                min="0.001"
                step="0.001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="prod-notes">Observações</label>
              <textarea id="prod-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
