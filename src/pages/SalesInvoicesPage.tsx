import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { ModalForm } from '../components/ModalForm'
import type { AppOutletContext } from '../components/AppLayout'
import { useClientBrand } from '../lib/client-brand'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatNumber, operationStatusBadgeClass, operationStatusLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Customer, Product, SalesInvoice } from '@shared/types'

type Line = { productId: string; quantity: string; unitPrice: string; priceEditable: boolean }

export function SalesInvoicesPage() {
  const { push } = useToast()
  const navigate = useNavigate()
  const { brand } = useClientBrand()
  const { user } = useOutletContext<AppOutletContext>()
  const isAdmin = user.role === 'admin'
  const [invoices, setInvoices] = useState<SalesInvoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [open, setOpen] = useState(false)
  const [receipt, setReceipt] = useState<SalesInvoice | null>(null)
  const [reversing, setReversing] = useState<SalesInvoice | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [number, setNumber] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  const load = useCallback(async () => {
    try {
      const [sales, clients, finished] = await Promise.all([
        unwrap(api.listSalesInvoices()), unwrap(api.listCustomers(true)),
        unwrap(api.listProducts({ active: true, kind: 'acabado' })),
      ])
      setInvoices(sales); setCustomers(clients); setProducts(finished)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível carregar a faturação de saída', 'err')
    }
  }, [push])

  useEffect(() => { void load() }, [load])

  const total = useMemo(() => lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0,
  ), [lines])
  const invoiceTotal = (invoice: SalesInvoice) => invoice.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice, 0,
  )

  function defaultLine(product: Product): Line {
    return { productId: product.id, quantity: '1', unitPrice: String(product.salePrice), priceEditable: false }
  }

  function start() {
    const product = products[0]
    setNumber(`FS-${Date.now().toString().slice(-6)}`)
    setCustomerId(customers[0]?.id ?? '')
    setIssueDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setLines(product ? [defaultLine(product)] : [])
    setOpen(true)
  }

  function changeProduct(index: number, id: string) {
    const product = products.find((item) => item.id === id)
    if (product) setLines(lines.map((line, i) => i === index ? defaultLine(product) : line))
  }

  function togglePrice(index: number, product: Product | undefined) {
    setLines(lines.map((line, i) => i === index ? {
      ...line,
      priceEditable: !line.priceEditable,
      unitPrice: line.priceEditable ? String(product?.salePrice ?? 0) : line.unitPrice,
    } : line))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    try {
      const invoice = await unwrap(api.createSalesInvoice({
        number, customerId, issueDate, notes,
        items: lines.map((line) => ({
          productId: line.productId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
        })),
      }))
      push('Fatura de saída registada e stock atualizado')
      setOpen(false); setReceipt(invoice); await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível registar a fatura de saída', 'err')
    }
  }

  async function reverse(event: FormEvent) {
    event.preventDefault()
    if (!reversing) return
    try {
      await unwrap(api.reverseSalesInvoice({ id: reversing.id, reason: reversalReason }))
      push('Fatura de saída estornada e stock atualizado')
      setReversing(null); setReversalReason(''); await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível estornar a fatura de saída', 'err')
    }
  }

  return <div className="collection-page" data-testid="sales-invoices-page">
    <CollectionPageHeader icon="↑" description="Registe vendas de produtos finais e efetue automaticamente a respetiva saída de stock." count={invoices.length} singular="fatura emitida" plural="faturas emitidas">
      <button className="btn btn-primary" onClick={start} disabled={!customers.length || !products.length}>Nova fatura de saída</button>
    </CollectionPageHeader>

    {(!customers.length || !products.length) ? <div className="seed-banner">
      <span>{!customers.length ? 'Registe um cliente antes de emitir uma fatura.' : 'É necessário ter um produto final ativo para faturar.'}</span>
      {!customers.length ? <button className="btn btn-ghost" onClick={() => navigate('/clientes')}>Abrir clientes</button> : null}
    </div> : null}

    <div className="panel table-wrap">{invoices.length === 0
      ? <CollectionEmpty icon="↑" title="Ainda não existem faturas de saída" description="Emita a primeira fatura para registar uma venda e gerar o recibo." />
      : <table className="collection-table"><thead><tr><th>Fatura</th><th>Data</th><th>Cliente</th><th>Produtos</th><th>Total</th><th>Estado</th><th>Ações</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.number}</strong></td><td>{new Date(`${invoice.issueDate}T12:00:00`).toLocaleDateString('pt-PT')}</td><td>{invoice.customerName}</td><td>{invoice.items.length}</td><td><strong>{formatCurrency(invoiceTotal(invoice))}</strong></td><td><span className={`badge ${operationStatusBadgeClass(invoice.status)}`}>{operationStatusLabel(invoice.status)}</span></td><td><div className="row-actions"><button className="btn btn-small btn-ghost" onClick={() => setReceipt(invoice)}>Ver recibo</button>{isAdmin && invoice.status === 'confirmado' ? <button className="btn btn-small btn-danger" onClick={() => { setReversing(invoice); setReversalReason('') }}>Estornar</button> : null}</div></td></tr>)}</tbody></table>}
    </div>

    {open ? <ModalForm title="Nova fatura de saída" hint="Os preços são carregados do registo do produto. Use “Alterar preço” apenas quando necessário." onClose={() => setOpen(false)} onSubmit={save} submitLabel="Emitir fatura e recibo">
      <div className="form-grid">
        <div className="field"><label>Número *</label><input value={number} onChange={(e) => setNumber(e.target.value)} required /></div>
        <div className="field"><label>Data *</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required /></div>
        <div className="field full"><div className="field-label-actions"><label>Cliente *</label><button type="button" className="field-link" onClick={() => navigate('/clientes')}>Registar ou consultar clientes</button></div><select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required><option value="">Selecione</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.taxNumber ? ` · ${customer.taxNumber}` : ''}</option>)}</select></div>
      </div>
      <div className="invoice-items"><strong>Produtos finais</strong>
        {lines.map((line, index) => {
          const product = products.find((item) => item.id === line.productId)
          return <div className="invoice-item-grid" key={index}>
            <div className="field"><label>Produto final *</label><select value={line.productId} onChange={(e) => changeProduct(index, e.target.value)} required>{products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} · stock {formatNumber(item.stock)} {item.unit}</option>)}</select></div>
            <div className="field"><label>Quantidade *</label><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} required /></div>
            <div className="field sales-price-field"><div className="field-label-actions"><label>Preço unitário *</label><button type="button" className="field-link" onClick={() => togglePrice(index, product)}>{line.priceEditable ? 'Repor preço do produto' : 'Alterar preço'}</button></div>{line.priceEditable ? <input type="number" min="0" step="0.01" value={line.unitPrice} autoFocus onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} required /> : <div className="sales-price-display" data-testid={`sales-price-${index}`}>{formatCurrency(Number(line.unitPrice) || 0)}</div>}</div>
            <button type="button" className="btn btn-small btn-danger" onClick={() => setLines(lines.filter((_, i) => i !== index))}>Remover</button>
            <small>Disponível: {formatNumber(product?.stock ?? 0)} {product?.unit}</small>
          </div>
        })}
        <button type="button" className="btn btn-ghost" onClick={() => { const product = products[0]; if (product) setLines([...lines, defaultLine(product)]) }}>+ Adicionar produto</button>
        <div className="invoice-form-total"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
      </div>
      <div className="field full"><label>Observações</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
    </ModalForm> : null}

    {receipt ? <ModalForm title={`Recibo ${receipt.number}`} onClose={() => setReceipt(null)} onSubmit={() => window.print()} submitLabel="Imprimir ou guardar em PDF" cancelLabel="Fechar"><article className="receipt-print"><header><h2>{brand.name || 'Sua empresa'}</h2><strong>RECIBO</strong><p>Fatura: {receipt.number} · Data: {new Date(`${receipt.issueDate}T12:00:00`).toLocaleDateString('pt-PT')}</p></header><section><strong>Cliente: {receipt.customerName}</strong><p>NIF: {receipt.customerTaxNumber || 'Não indicado'}</p><p>{receipt.customerAddress}</p></section><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th></tr></thead><tbody>{receipt.items.map((item) => <tr key={item.id}><td>{item.productName}</td><td>{formatNumber(item.quantity)} {item.productUnit}</td><td>{formatCurrency(item.unitPrice)}</td><td>{formatCurrency(item.quantity * item.unitPrice)}</td></tr>)}</tbody><tfoot><tr><td colSpan={3}>Total recebido</td><td>{formatCurrency(invoiceTotal(receipt))}</td></tr></tfoot></table>{receipt.notes ? <p>Observações: {receipt.notes}</p> : null}<footer>Documento gerado pelo ERP Cortexis Tech.</footer></article></ModalForm> : null}

    {reversing ? <ModalForm title={`Estornar fatura ${reversing.number}`} hint="O estorno devolve o stock ao estado anterior e fica registado no histórico. Esta ação não pode ser desfeita." onClose={() => setReversing(null)} onSubmit={reverse} submitLabel="Confirmar estorno" cancelLabel="Cancelar">
      <div className="field full">
        <label htmlFor="sales-reverse-reason">Motivo do estorno *</label>
        <textarea id="sales-reverse-reason" required minLength={5} value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} placeholder="Ex.: venda registada em duplicado" />
      </div>
    </ModalForm> : null}
  </div>
}
