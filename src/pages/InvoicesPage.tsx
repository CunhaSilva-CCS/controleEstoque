import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatDateTime, formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Product, PurchaseInvoice, Supplier } from '@shared/types'

type InvoiceItemForm = {
  productId: string
  quantity: string
  unitCost: string
}

const emptyItem: InvoiceItemForm = { productId: '', quantity: '1', unitCost: '0' }

export function InvoicesPage() {
  const navigate = useNavigate()
  const { push } = useToast()
  const [items, setItems] = useState<PurchaseInvoice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null)
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
    setEditingId(null)
    setNumber('')
    setSupplierId('')
    setIssueDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setLineItems([{ productId: products[0]?.id ?? '', quantity: '1', unitCost: '0' }])
    setOpen(true)
  }

  function openEdit(invoice: PurchaseInvoice) {
    setViewInvoice(null)
    setEditingId(invoice.id)
    setNumber(invoice.number)
    setSupplierId(invoice.supplierId ?? '')
    setIssueDate(invoice.issueDate)
    setNotes(invoice.notes)
    setLineItems(invoice.items.map((item) => ({
      productId: item.productId,
      quantity: String(item.quantity),
      unitCost: String(item.unitCost),
    })))
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      const payload = {
          number,
          supplierId: supplierId || null,
          issueDate,
          notes,
          items: lineItems.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity) || 0,
            unitCost: Number(item.unitCost) || 0,
          })),
        }
      await unwrap(editingId
        ? api.updatePurchaseInvoice({ id: editingId, ...payload })
        : api.createPurchaseInvoice(payload))
      push(editingId ? 'Fatura atualizada e estoque recalculado' : 'Fatura lançada e estoque atualizado')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao lançar fatura', 'err')
    }
  }

  return (
    <div className="collection-page invoices-page" data-testid="invoices-page">
      <CollectionPageHeader icon="↓" description="Entrada de insumos no estoque por meio das faturas de compra." count={items.length} singular="fatura registrada" plural="faturas registradas">
        <button
          className="btn btn-primary"
          data-testid="btn-new-invoice"
          onClick={openCreate}
          disabled={products.length === 0}
        >
          <span aria-hidden>+</span>
          Lançar fatura
        </button>
      </CollectionPageHeader>

      <div className="panel panel-flush">
        {items.length === 0 ? (
          <CollectionEmpty icon="↓" title="Nenhuma fatura registrada" description="Lance uma fatura de compra para registrar a entrada de insumos." />
        ) : (
          <div className="table-wrap">
            <table className="collection-table invoices-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Fornecedor</th>
                  <th>Itens</th>
                  <th>Registrada em</th>
                  <th>Ações</th>
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
                        <div key={item.id} className="invoice-list-item">
                          <span>{item.productSku} · {item.productName} · {formatNumber(item.quantity)} {item.productUnit}</span>
                          <small>{formatCurrency(item.unitCost)} / {item.productUnit} · Total: {formatCurrency(item.quantity * item.unitCost)}</small>
                        </div>
                      ))}
                      <strong className="invoice-list-total">Total: {formatCurrency(inv.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0))}</strong>
                    </td>
                    <td>{formatDateTime(inv.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setViewInvoice(inv)}>Visualizar</button>
                        <button type="button" className="btn btn-ghost" onClick={() => openEdit(inv)}>Editar</button>
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
          title={editingId ? 'Editar fatura de compra' : 'Lançar fatura de compra'}
          hint={editingId ? 'As diferenças de quantidade atualizarão o estoque e ficarão registradas no histórico.' : 'Somente insumos entram por fatura. O custo unitário informado atualiza o produto.'}
          onClose={() => setOpen(false)}
          onSubmit={save}
          submitLabel={editingId ? 'Salvar alterações' : 'Lançar fatura'}
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
              <div className="field-label-actions">
                <label htmlFor="inv-sup">Fornecedor cadastrado</label>
                <button type="button" className="field-link" onClick={() => navigate('/fornecedores')}>Abrir fornecedores</button>
              </div>
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

          <div className="stack form-section">
            <strong>Itens da fatura</strong>
            {lineItems.map((item, idx) => {
              const selectedProduct = products.find((product) => product.id === item.productId)
              return (
              <div key={idx} className="line-item-card">
                <div className="line-item-header">
                  <strong>Item {idx + 1}</strong>
                  {lineItems.length > 1 ? (
                    <button
                      type="button"
                      className="field-link field-link-danger"
                      onClick={() => setLineItems(lineItems.filter((_, lineIndex) => lineIndex !== idx))}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                <div className="form-grid">
                <div className="field full">
                  <div className="field-label-actions">
                    <label>Insumo cadastrado *</label>
                    <button type="button" className="field-link" onClick={() => navigate('/produtos')}>Abrir produtos</button>
                  </div>
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
                        {p.sku} · {p.name} · Unidade: {p.unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Quantidade ({selectedProduct?.unit ?? 'unidade'}) *</label>
                  <div className="quantity-with-unit">
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
                    <span>{selectedProduct?.unit ?? '—'}</span>
                  </div>
                </div>
                <div className="field">
                  <label>Custo unitário (R$ / {selectedProduct?.unit ?? 'unidade'}) *</label>
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
                <div className="invoice-line-total" aria-live="polite">
                  <span>Total do item</span>
                  <strong>{formatCurrency((Number(item.quantity) || 0) * (Number(item.unitCost) || 0))}</strong>
                </div>
                </div>
              </div>
              )
            })}
            <div className="invoice-form-total" aria-live="polite">
              <span>Total da fatura</span>
              <strong>{formatCurrency(lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0))}</strong>
            </div>
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

      {viewInvoice ? (
        <ModalForm
          title={`Fatura ${viewInvoice.number}`}
          hint={`Registrada em ${formatDateTime(viewInvoice.createdAt)}`}
          onClose={() => setViewInvoice(null)}
          onSubmit={() => openEdit(viewInvoice)}
          submitLabel="Editar fatura"
          cancelLabel="Fechar"
        >
          <div className="invoice-details">
            <dl className="invoice-summary">
              <div><dt>Data</dt><dd>{viewInvoice.issueDate}</dd></div>
              <div><dt>Fornecedor</dt><dd>{viewInvoice.supplierName ?? 'Não informado'}</dd></div>
              <div className="full"><dt>Observações</dt><dd>{viewInvoice.notes || 'Sem observações'}</dd></div>
            </dl>
            <div className="table-wrap">
              <table className="invoice-detail-table">
                <thead><tr><th>Insumo</th><th>Quantidade</th><th>Custo unitário</th><th>Total</th></tr></thead>
                <tbody>
                  {viewInvoice.items.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.productSku}</strong><br />{item.productName}</td>
                      <td>{formatNumber(item.quantity)} {item.productUnit}</td>
                      <td>{formatCurrency(item.unitCost)}</td>
                      <td>{formatCurrency(item.quantity * item.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total da fatura</td><td>{formatCurrency(viewInvoice.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0))}</td></tr></tfoot>
              </table>
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
