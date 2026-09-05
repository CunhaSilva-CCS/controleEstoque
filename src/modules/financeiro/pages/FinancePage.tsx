import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../../../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../../../components/CollectionPage'
import { api, unwrap } from '../../../lib/api'
import { useToast } from '../../../lib/toast'
import { formatCurrency } from '../../../lib/format'
import type { FinanceEntry, FinanceEntryStatus, FinanceEntryType } from '@shared/types'

type FormState = {
  type: FinanceEntryType
  description: string
  amount: string
  dueDate: string
  reference: string
  notes: string
}

const empty: FormState = {
  type: 'pagar',
  description: '',
  amount: '',
  dueDate: '',
  reference: '',
  notes: '',
}

type TypeFilter = 'todos' | FinanceEntryType
type StatusFilter = 'todos' | FinanceEntryStatus

function formatDueDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
}

export function FinancePage() {
  const { push } = useToast()
  const [items, setItems] = useState<FinanceEntry[]>([])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(empty)

  const load = useCallback(async () => {
    try {
      setItems(
        await unwrap(
          api.listFinanceEntries({
            type: typeFilter === 'todos' ? undefined : typeFilter,
            status: statusFilter === 'todos' ? undefined : statusFilter,
          }),
        ),
      )
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível carregar os lançamentos', 'err')
    }
  }, [push, typeFilter, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate(type: FinanceEntryType) {
    setForm({ ...empty, type })
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      const amount = Number(form.amount.replace(',', '.'))
      await unwrap(
        api.createFinanceEntry({
          type: form.type,
          description: form.description,
          amount,
          dueDate: form.dueDate,
          reference: form.reference,
          notes: form.notes,
        }),
      )
      push('Lançamento registado')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível registar o lançamento', 'err')
    }
  }

  async function togglePaid(entry: FinanceEntry) {
    try {
      await unwrap(api.markFinanceEntryPaid(entry.id, entry.status !== 'pago'))
      push(entry.status === 'pago' ? 'Lançamento reaberto' : 'Lançamento marcado como pago')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível atualizar o lançamento', 'err')
    }
  }

  async function remove(entry: FinanceEntry) {
    if (!window.confirm(`Excluir o lançamento "${entry.description}"?`)) return
    try {
      await unwrap(api.deleteFinanceEntry(entry.id))
      push('Lançamento excluído')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível excluir o lançamento', 'err')
    }
  }

  const totalPagar = items.filter((item) => item.type === 'pagar' && item.status === 'pendente').reduce((sum, item) => sum + item.amount, 0)
  const totalReceber = items.filter((item) => item.type === 'receber' && item.status === 'pendente').reduce((sum, item) => sum + item.amount, 0)

  return (
    <div className="collection-page finance-page" data-testid="finance-page">
      <CollectionPageHeader
        icon="€"
        description="Contas a pagar e a receber: registe compromissos financeiros e acompanhe vencimentos."
        count={items.length}
        singular="lançamento"
        plural="lançamentos"
      >
        <button className="btn btn-secondary" data-testid="btn-new-payable" onClick={() => openCreate('pagar')}>
          Nova conta a pagar
        </button>
        <button className="btn btn-primary" data-testid="btn-new-receivable" onClick={() => openCreate('receber')}>
          Nova conta a receber
        </button>
      </CollectionPageHeader>

      <div className="summary" style={{ display: 'flex', gap: '1rem', margin: '0 0 1rem' }}>
        <div className="empty" style={{ flex: 1, textAlign: 'left' }}>
          <strong>A pagar (pendente)</strong>
          <p>{formatCurrency(totalPagar)}</p>
        </div>
        <div className="empty" style={{ flex: 1, textAlign: 'left' }}>
          <strong>A receber (pendente)</strong>
          <p>{formatCurrency(totalReceber)}</p>
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: '0.5rem', margin: '0 0 1rem' }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
          <option value="todos">Todos os tipos</option>
          <option value="pagar">A pagar</option>
          <option value="receber">A receber</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="todos">Todos os estados</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
        </select>
      </div>

      {items.length === 0 ? (
        <CollectionEmpty icon="€" title="Nenhum lançamento" description="Registe uma conta a pagar ou a receber para começar." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Referência</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.type === 'pagar' ? 'A pagar' : 'A receber'}</td>
                <td>{entry.description}</td>
                <td>{formatDueDate(entry.dueDate)}</td>
                <td>{formatCurrency(entry.amount)}</td>
                <td>{entry.reference || '—'}</td>
                <td>
                  <span className={`badge ${entry.status === 'pago' ? 'badge-ok' : 'badge-low'}`}>
                    {entry.status === 'pago' ? 'Pago' : 'Pendente'}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" onClick={() => togglePaid(entry)}>
                    {entry.status === 'pago' ? 'Reabrir' : 'Marcar como pago'}
                  </button>
                  {entry.status === 'pendente' ? (
                    <button className="btn btn-danger" onClick={() => remove(entry)}>
                      Excluir
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open ? (
        <ModalForm
          title={form.type === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}
          onClose={() => setOpen(false)}
          onSubmit={save}
        >
          <label className="field full">
            <span>Descrição *</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </label>
          <label className="field">
            <span>Valor *</span>
            <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </label>
          <label className="field">
            <span>Vencimento *</span>
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
          </label>
          <label className="field">
            <span>Referência</span>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="ex: nº da fatura" />
          </label>
          <label className="field full">
            <span>Notas</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </label>
        </ModalForm>
      ) : null}
    </div>
  )
}
