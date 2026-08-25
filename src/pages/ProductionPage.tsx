import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import type { AppOutletContext } from '../components/AppLayout'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatDateTime, formatNumber, operationStatusBadgeClass, operationStatusLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Product, ProductionOrder, Recipe } from '@shared/types'

export function ProductionPage() {
  const navigate = useNavigate()
  const { push } = useToast()
  const { user } = useOutletContext<AppOutletContext>()
  const isAdmin = user.role === 'admin'
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [finished, setFinished] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [reversing, setReversing] = useState<ProductionOrder | null>(null)
  const [reversalReason, setReversalReason] = useState('')

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
      push(err instanceof Error ? err.message : 'Não foi possível carregar as fabricações', 'err')
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
      push('Fabricação registada e stock atualizado com sucesso')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível registrar a fabricação', 'err')
    }
  }

  async function reverse(e: FormEvent) {
    e.preventDefault()
    if (!reversing) return
    try {
      await unwrap(api.reverseProductionOrder({ id: reversing.id, reason: reversalReason }))
      push('Fabricação estornada e stock recalculado com sucesso')
      setReversing(null)
      setReversalReason('')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível estornar a fabricação', 'err')
    }
  }

  return (
    <div className="collection-page production-page" data-testid="production-page">
      <CollectionPageHeader icon="⚙" description="Registe a produção dos produtos finais e desconte automaticamente as matérias-primas utilizadas." count={orders.length} singular="fabricação registada" plural="fabricações registadas">
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
          <CollectionEmpty icon="⚙" title="Ainda não existem fabricações registadas" description="Registe a primeira fabricação para atualizar o stock do produto final e das matérias-primas." />
        ) : (
          <div className="table-wrap">
            <table className="collection-table production-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  <th>Custo unitário</th>
                  <th>Custo total</th>
                  <th>Observações</th>
                  <th>Data</th>
                  <th>Estado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      {order.productSku} · {order.productName}
                    </td>
                    <td>{formatNumber(order.quantity)}</td>
                    <td>{formatCurrency(order.unitCostSnapshot)}</td>
                    <td>{formatCurrency(order.totalCostSnapshot)}</td>
                    <td>{order.notes || '—'}</td>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td>
                      <span className={`badge ${operationStatusBadgeClass(order.status)}`}>{operationStatusLabel(order.status)}</span>
                    </td>
                    <td>
                      {isAdmin && order.status === 'confirmado' ? (
                        <button type="button" className="btn btn-small btn-danger" onClick={() => { setReversing(order); setReversalReason('') }}>Estornar</button>
                      ) : null}
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
          title="Registrar fabricação"
          hint={
            recipe
              ? `Receita: ${recipe.items.map((i) => `${i.productSku} (${formatNumber(i.quantity)})`).join(', ')}`
              : 'Cadastre a receita do produto final antes de fabricar'
          }
          onClose={() => setOpen(false)}
          onSubmit={save}
          submitLabel="Registrar fabricação"
        >
          <div className="form-grid">
            <div className="field full">
              <div className="field-label-actions">
                <label htmlFor="prod-product">Produto final *</label>
                <button type="button" className="field-link" onClick={() => navigate('/receitas')}>Registar ou consultar receitas</button>
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
                min="0.000001"
                step="0.000001"
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

      {reversing ? (
        <ModalForm
          title={`Estornar fabricação de ${reversing.productName}`}
          hint="O estorno devolve as matérias-primas consumidas e retira o produto final gerado. Esta ação não pode ser desfeita."
          onClose={() => setReversing(null)}
          onSubmit={reverse}
          submitLabel="Confirmar estorno"
          cancelLabel="Cancelar"
        >
          <div className="field full">
            <label htmlFor="production-reverse-reason">Motivo do estorno *</label>
            <textarea
              id="production-reverse-reason"
              required
              minLength={5}
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="Ex.: fabricação registada com quantidade errada"
            />
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
