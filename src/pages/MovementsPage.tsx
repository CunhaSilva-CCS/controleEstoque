import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, unwrap } from '../lib/api'
import { formatDateTime, formatNumber, movementLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { MovementType, Product, StockMovement } from '@shared/types'

export function MovementsPage() {
  const { push } = useToast()
  const [items, setItems] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [type, setType] = useState<'' | MovementType>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState(false)
  const [formProductId, setFormProductId] = useState('')
  const [formType, setFormType] = useState<MovementType>('entrada')
  const [qty, setQty] = useState('1')
  const [newStock, setNewStock] = useState('0')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')

  const selected = products.find((p) => p.id === formProductId)

  const load = useCallback(async () => {
    try {
      const [movs, prods] = await Promise.all([
        unwrap(
          api.listMovements({
            productId: productId || undefined,
            type: type || undefined,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          }),
        ),
        unwrap(api.listProducts({ active: true })),
      ])
      setItems(movs)
      setProducts(prods)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar movimentações', 'err')
    }
  }, [productId, type, from, to, push])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setFormProductId(products[0]?.id ?? '')
    setFormType('entrada')
    setQty('1')
    setNewStock(String(products[0]?.stock ?? 0))
    setReason('')
    setReference('')
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await unwrap(
        api.createMovement({
          productId: formProductId,
          type: formType,
          quantity: Number(qty) || 0,
          newStock: formType === 'ajuste' ? Number(newStock) : undefined,
          reason,
          reference,
        }),
      )
      push('Movimentação registrada')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao registrar', 'err')
    }
  }

  return (
    <div data-testid="movements-page">
      <div className="page-header">
        <div>
          <h2>Movimentações</h2>
          <p>Histórico imutável de entradas, saídas e ajustes</p>
        </div>
        <button className="btn btn-primary" data-testid="btn-new-movement" onClick={openCreate} disabled={products.length === 0}>
          Nova movimentação
        </button>
      </div>

      <div className="toolbar">
        <div className="field-inline">
          <label htmlFor="fprod">Produto</label>
          <select id="fprod" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-inline">
          <label htmlFor="ftype">Tipo</label>
          <select
            id="ftype"
            value={type}
            onChange={(e) => setType(e.target.value as '' | MovementType)}
          >
            <option value="">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
            <option value="ajuste">Ajuste</option>
          </select>
        </div>
        <div className="field-inline">
          <label htmlFor="ffrom">De</label>
          <input id="ffrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field-inline">
          <label htmlFor="fto">Até</label>
          <input id="fto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <div className="empty">Nenhuma movimentação no filtro atual</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Qtd</th>
                  <th>Anterior</th>
                  <th>Novo</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.createdAt)}</td>
                    <td>{m.productSku}</td>
                    <td>{m.productName}</td>
                    <td>
                      <span className={`badge badge-${m.type}`}>{movementLabel(m.type)}</span>
                    </td>
                    <td>{formatNumber(m.quantity)}</td>
                    <td>{formatNumber(m.previousStock)}</td>
                    <td>{formatNumber(m.newStock)}</td>
                    <td>
                      {m.reason}
                      {m.reference ? <span className="muted"> · {m.reference}</span> : null}
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
          title="Nova movimentação"
          hint={
            selected
              ? `Saldo atual de ${selected.name}: ${formatNumber(selected.stock)} ${selected.unit}`
              : 'Selecione um produto ativo'
          }
          onClose={() => setOpen(false)}
          onSubmit={save}
          submitLabel="Registrar"
        >
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="mprod">Produto *</label>
              <select
                id="mprod" data-testid="select-movement-product"
                required
                value={formProductId}
                onChange={(e) => {
                  setFormProductId(e.target.value)
                  const p = products.find((x) => x.id === e.target.value)
                  if (p) setNewStock(String(p.stock))
                }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="mtype2">Tipo</label>
              <select
                id="mtype2" data-testid="select-movement-type"
                value={formType}
                onChange={(e) => setFormType(e.target.value as MovementType)}
              >
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="ajuste">Ajuste</option>
              </select>
            </div>
            {formType === 'ajuste' ? (
              <div className="field">
                <label htmlFor="mnew2">Novo saldo *</label>
                <input
                  id="mnew2" data-testid="input-movement-new-stock"
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="mqty2">Quantidade *</label>
                <input
                  id="mqty2" data-testid="input-movement-qty"
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
            )}
            <div className="field full">
              <label htmlFor="mreason2">Motivo *</label>
              <input
                id="mreason2" data-testid="input-movement-reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="mref2">Referência</label>
              <input
                id="mref2"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
