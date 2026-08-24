import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { api, unwrap } from '../lib/api'
import { formatDateTime, formatNumber, movementLabel, movementOriginLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { MovementType, Product, StockMovement } from '@shared/types'

export function MovementsPage({
  initialType = '',
  outputView = false,
}: {
  initialType?: '' | MovementType
  outputView?: boolean
} = {}) {
  const navigate = useNavigate()
  const { push } = useToast()
  const [items, setItems] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [type, setType] = useState<'' | MovementType>(initialType)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState(false)
  const [formProductId, setFormProductId] = useState('')
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
      push(err instanceof Error ? err.message : 'Não foi possível carregar as movimentações', 'err')
    }
  }, [productId, type, from, to, push])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setFormProductId(products[0]?.id ?? '')
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
          type: 'ajuste',
          quantity: 0,
          newStock: Number(newStock),
          reason,
          reference,
        }),
      )
      push('Ajuste registado e stock atualizado com sucesso')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível registrar o ajuste', 'err')
    }
  }

  function clearFilters() {
    setProductId('')
    setType(initialType)
    setFrom('')
    setTo('')
  }

  const hasFilters = Boolean(productId || from || to || (!outputView && type))

  return (
    <div className="movements-page" data-testid="movements-page">
      <div className="page-header movements-page-header">
        <div className="movements-intro">
          <span className="movements-intro-icon" aria-hidden>↕</span>
          <div>
            <p>{outputView ? 'Consulte as saídas registadas no stock.' : 'Consulte todas as entradas, saídas e correções efetuadas no stock.'}</p>
            <span className="movements-count">
              {items.length} {items.length === 1 ? 'movimentação encontrada' : 'movimentações encontradas'}
            </span>
          </div>
        </div>
        {!outputView ? (
          <button className="btn btn-primary" data-testid="btn-new-movement" onClick={openCreate} disabled={products.length === 0}>
            <span aria-hidden>+</span>
            Novo ajuste
          </button>
        ) : null}
      </div>

      <div className="toolbar movements-toolbar">
        <div className="movements-filter-heading">
          <div>
            <strong>Filtros</strong>
            <span>Refine o histórico por produto, tipo ou período.</span>
          </div>
          <button
            type="button"
            className="field-link"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Limpar filtros
          </button>
        </div>
        <div className="field-inline movements-product-filter">
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
        <div className="field-inline" hidden={outputView}>
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

      <div className="panel panel-flush">
        {items.length === 0 ? (
          <div className="empty movements-empty">
            <span aria-hidden>⇄</span>
            <strong>Não encontramos movimentações</strong>
            <p>Ajuste os filtros ou registre uma nova correção de inventário.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="movements-table">
              <colgroup>
                <col className="movement-col-date" />
                <col className="movement-col-code" />
                <col className="movement-col-product" />
                <col className="movement-col-type" />
                <col className="movement-col-origin" />
                <col className="movement-col-number" />
                <col className="movement-col-number" />
                <col className="movement-col-number" />
                <col className="movement-col-reason" />
              </colgroup>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Código</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Origem</th>
                  <th>Qtd</th>
                  <th>Anterior</th>
                  <th>Novo</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const [movementDate, movementTime = ''] = formatDateTime(m.createdAt).split(', ')
                  return (
                  <tr key={m.id}>
                    <td className="movement-date">
                      <strong>{movementDate}</strong>
                      <span>{movementTime}</span>
                    </td>
                    <td className="movement-code">{m.productSku}</td>
                    <td className="movement-product">{m.productName}</td>
                    <td>
                      <span className={`badge badge-${m.type}`}>{movementLabel(m.type)}</span>
                    </td>
                    <td className="movement-origin">{movementOriginLabel(m.origin)}</td>
                    <td className="movement-number">{formatNumber(m.quantity)}</td>
                    <td className="movement-number movement-previous">{formatNumber(m.previousStock)}</td>
                    <td className="movement-number movement-new">{formatNumber(m.newStock)}</td>
                    <td className="movement-reason">
                      <strong>{m.reason}</strong>
                      {m.reference ? <span title={m.reference}>{m.reference}</span> : null}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <ModalForm
          title="Ajuste de inventário"
          hint={
            selected
              ? `Saldo atual de ${selected.name}: ${formatNumber(selected.stock)} ${selected.unit}`
              : 'Selecione um produto ativo'
          }
          onClose={() => setOpen(false)}
          onSubmit={save}
          submitLabel="Registrar ajuste"
        >
          <div className="form-grid">
            <div className="field full">
              <div className="field-label-actions">
                <label htmlFor="mprod">Produto *</label>
                <button type="button" className="field-link" onClick={() => navigate('/produtos')}>Registar ou consultar produtos</button>
              </div>
              <select
                id="mprod"
                data-testid="select-movement-product"
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
              <label htmlFor="mnew2">Novo saldo *</label>
              <input
                id="mnew2"
                data-testid="input-movement-new-stock"
                type="number"
                min="0"
                step="0.001"
                required
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="mreason2">Motivo *</label>
              <input
                id="mreason2"
                data-testid="input-movement-reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: contagem física, perda ou correção de lançamento"
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
