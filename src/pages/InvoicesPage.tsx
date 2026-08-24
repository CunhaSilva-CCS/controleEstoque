import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, unwrap } from '../lib/api'
import { formatDateTime, formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Product, PurchaseInvoice, Supplier } from '@shared/types'

type InvoiceItemForm = {
  productId: string
  quantity: string
  unitCost: string
}

const emptyItem: InvoiceItemForm = { productId: '', quantity: '1', unitCost: '0' }

export function InvoicesPage() {
  const { push } = useToast()
  const [items, setItems] = useState<PurchaseInvoice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<InvoiceItemForm[]>([{ ...emptyItem }])

  const load = useCallback(async () => {
    try {
      const [invoices, prods, sups] = await Promise.all([
        unwrap(api.listPurchaseInvoices()),
        unwrap(api.listProducts({ active: true, kind: 'insumo' })),
        unwrap(api.listSuppliers(true)),
      ])
      setItems(invoices)
      setProducts(prods)
      setSuppliers(sups)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar faturas', 'err')
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setNumber('')
    setSupplierId('')
    setIssueDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setLineItems([{ productId: products[0]?.id ?? '', quantity: '1', unitCost: '0' }])
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await unwrap(
        api.createPurchaseInvoice({
          number,
          supplierId: supplierId || null,
          issueDate,
          notes,
          items: lineItems.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity) || 0,
            unitCost: Number(item.unitCost) || 0,
          })),
        }),
      )
      push('Fatura lançada e estoque atualizado')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao lançar fatura', 'err')
    }
  }

  return (
    <div data-testid="invoices-page">
      <div className="page-header">
        <p>Entrada de insumos no estoque via fatura de compra</p>
        <button
          className="btn btn-primary"
          data-testid="btn-new-invoice"
          onClick={openCreate}
          disabled={products.length === 0}
        >
          Lançar fatura
        </button>
      </div>

      <div className="panel panel-flush">
        {items.length === 0 ? (
          <div className="empty">Nenhuma fatura registrada</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Fornecedor</th>
                  <th>Itens</th>
                  <th>Registrada em</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.number}</td>
                    <td>{inv.issueDate}</td>
                    <td>{inv.supplierName ?? '—'}</td>
                    <td>
                      {inv.items.map((item) => (
                        <div key={item.id}>
                          {item.productSku} · {formatNumber(item.quantity)} {item.productName}
                        </div>
                      ))}
                    </td>
                    <td>{formatDateTime(inv.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <ModalForm
          title="Lançar fatura de compra"
          hint="Somente insumos entram por fatura. O custo unitário informado atualiza o produto."
          onClose={() => setOpen(false)}
          onSubmit={save}
          submitLabel="Lançar fatura"
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="inv-num">Número da fatura *</label>
              <input
                id="inv-num"
                data-testid="input-invoice-number"
                required
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="inv-date">Data *</label>
              <input
                id="inv-date"
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="inv-sup">Fornecedor</label>
              <select id="inv-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="inv-notes">Observações</label>
              <textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="stack" style={{ marginTop: '1rem' }}>
            <strong>Itens da fatura</strong>
            {lineItems.map((item, idx) => (
              <div key={idx} className="form-grid">
                <div className="field full">
                  <label>Insumo *</label>
                  <select
                    data-testid={idx === 0 ? 'select-invoice-product' : undefined}
                    required
                    value={item.productId}
                    onChange={(e) => {
                      const next = [...lineItems]
                      next[idx] = { ...next[idx], productId: e.target.value }
                      setLineItems(next)
                    }}
                  >
                    <option value="">Selecione</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Quantidade *</label>
                  <input
                    data-testid={idx === 0 ? 'input-invoice-qty' : undefined}
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...lineItems]
                      next[idx] = { ...next[idx], quantity: e.target.value }
                      setLineItems(next)
                    }}
                  />
                </div>
                <div className="field">
                  <label>Custo unitário *</label>
                  <input
                    data-testid={idx === 0 ? 'input-invoice-cost' : undefined}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={item.unitCost}
                    onChange={(e) => {
                      const next = [...lineItems]
                      next[idx] = { ...next[idx], unitCost: e.target.value }
                      setLineItems(next)
                    }}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setLineItems([...lineItems, { ...emptyItem, productId: products[0]?.id ?? '' }])}
            >
              Adicionar item
            </button>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
