import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../components/ModalForm'
import { QuickProductModal } from '../components/QuickProductModal'
import { QuickSupplierModal } from '../components/QuickSupplierModal'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatDateTime, formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Invoice, Product, Supplier } from '@shared/types'

type ItemDraft = {
  key: string
  productId: string
  quantity: string
  unitCost: string
}

function newItem(products: Product[]): ItemDraft {
  const first = products[0]
  return {
    key: crypto.randomUUID(),
    productId: first?.id ?? '',
    quantity: '1',
    unitCost: String(first?.costPrice ?? 0),
  }
}

export function InvoicesPage() {
  const { push } = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [number, setNumber] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([])
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [productModalItemKey, setProductModalItemKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [list, prods, sups] = await Promise.all([
        unwrap(api.listInvoices()),
        unwrap(api.listProducts({ active: true })),
        unwrap(api.listSuppliers(true)),
      ])
      setInvoices(list)
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
    setItems(products.length ? [newItem(products)] : [])
    setOpen(true)
  }

  async function openDetail(id: string) {
    try {
      const invoice = await unwrap(api.getInvoice(id))
      setDetail(invoice)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao abrir fatura', 'err')
    }
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        const next = { ...item, ...patch }
        if (patch.productId) {
          const product = products.find((p) => p.id === patch.productId)
          if (product && item.unitCost === String(products.find((p) => p.id === item.productId)?.costPrice ?? '')) {
            next.unitCost = String(product.costPrice)
          }
        }
        return next
      }),
    )
  }

  function addItem() {
    setItems((prev) => [...prev, newItem(products)])
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((i) => i.key !== key)))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await unwrap(
        api.createInvoice({
          number,
          supplierId: supplierId || null,
          issueDate,
          notes,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity) || 0,
            unitCost: Number(item.unitCost) || 0,
          })),
        }),
      )
      push('Fatura registrada — estoque atualizado')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao registrar fatura', 'err')
    }
  }

  function openProductModal(itemKey: string | null = null) {
    setProductModalItemKey(itemKey)
    setProductModalOpen(true)
  }

  function handleProductCreated(product: Product) {
    setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)))
    if (productModalItemKey) {
      updateItem(productModalItemKey, {
        productId: product.id,
        unitCost: String(product.costPrice),
      })
    } else if (items.length === 0) {
      setItems([
        {
          key: crypto.randomUUID(),
          productId: product.id,
          quantity: '1',
          unitCost: String(product.costPrice),
        },
      ])
    }
  }

  function handleSupplierCreated(supplier: Supplier) {
    setSuppliers((prev) => [...prev, supplier].sort((a, b) => a.name.localeCompare(b.name)))
    setSupplierId(supplier.id)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Faturas</h2>
          <p>Entrada automática no estoque ao registrar a nota fiscal</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setSupplierModalOpen(true)}>
            Novo fornecedor
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => openProductModal()}>
            Novo produto
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            Nova fatura
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {invoices.length === 0 ? (
          <div className="empty">Nenhuma fatura registrada</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fornecedor</th>
                  <th>Emissão</th>
                  <th>Itens</th>
                  <th>Total</th>
                  <th>Registrada em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.number}</td>
                    <td>{inv.supplierName ?? '—'}</td>
                    <td>{new Date(inv.issueDate).toLocaleDateString('pt-BR')}</td>
                    <td>{inv.itemCount ?? 0}</td>
                    <td>{formatCurrency(inv.totalValue ?? 0)}</td>
                    <td>{formatDateTime(inv.createdAt)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => void openDetail(inv.id)}>
                        Ver
                      </button>
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
          title="Nova fatura"
          hint="Cada item gera uma entrada no estoque vinculada ao número da fatura"
          onClose={() => setOpen(false)}
          onSubmit={save}
          submitLabel="Registrar fatura"
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="invnum">Número *</label>
              <input
                id="invnum"
                required
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="NF-12345"
              />
            </div>
            <div className="field">
              <label htmlFor="invdate">Data de emissão *</label>
              <input
                id="invdate"
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="invsup">Fornecedor</label>
              <div className="field-with-action">
                <select
                  id="invsup"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Sem fornecedor</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSupplierModalOpen(true)}
                >
                  + Novo
                </button>
              </div>
            </div>
            <div className="field full">
              <label htmlFor="invnotes">Observações</label>
              <input id="invnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="section-title row-between">
            <span>Itens</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openProductModal()}>
              + Novo produto
            </button>
          </div>
          {products.length === 0 ? (
            <div className="empty" style={{ marginBottom: '1rem' }}>
              Cadastre um produto para incluir itens na fatura.
            </div>
          ) : null}
          {items.map((item, index) => (
            <div key={item.key} className="form-grid item-row">
              <div className="field full">
                <label htmlFor={`prod-${item.key}`}>Produto *</label>
                <div className="field-with-action">
                  <select
                    id={`prod-${item.key}`}
                    required
                    value={item.productId}
                    onChange={(e) => updateItem(item.key, { productId: e.target.value })}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name} (saldo: {formatNumber(p.stock)} {p.unit})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openProductModal(item.key)}
                  >
                    + Novo
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor={`qty-${item.key}`}>Quantidade *</label>
                <input
                  id={`qty-${item.key}`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={item.quantity}
                  onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`cost-${item.key}`}>Custo unit.</label>
                <input
                  id={`cost-${item.key}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitCost}
                  onChange={(e) => updateItem(item.key, { unitCost: e.target.value })}
                />
              </div>
              {items.length > 1 ? (
                <div className="field" style={{ alignSelf: 'end' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => removeItem(item.key)}
                  >
                    Remover
                  </button>
                </div>
              ) : null}
              {index < items.length - 1 ? <div className="field full"><hr /></div> : null}
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={addItem} disabled={products.length === 0}>
            + Adicionar item
          </button>
        </ModalForm>
      ) : null}

      <QuickSupplierModal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        onCreated={handleSupplierCreated}
      />
      <QuickProductModal
        open={productModalOpen}
        onClose={() => {
          setProductModalOpen(false)
          setProductModalItemKey(null)
        }}
        onCreated={handleProductCreated}
        defaultSupplierId={supplierId}
        zeroInitialStock
      />

      {detail ? (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>Fatura {detail.number}</h3>
            <p className="hint">
              {detail.supplierName ?? 'Sem fornecedor'} ·{' '}
              {new Date(detail.issueDate).toLocaleDateString('pt-BR')}
            </p>
            {detail.notes ? <p className="hint">{detail.notes}</p> : null}
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Custo</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.productSku}</td>
                      <td>{item.productName}</td>
                      <td>{formatNumber(item.quantity)}</td>
                      <td>{formatCurrency(item.unitCost)}</td>
                      <td>{formatCurrency(item.quantity * item.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDetail(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
