import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import type { AppOutletContext } from '../components/AppLayout'
import { api, unwrap } from '../lib/api'
import { formatDateTime, formatNumber, inventoryStatusBadgeClass, inventoryStatusLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { InventorySession } from '@shared/types'

const ACTIVE_STATUSES = new Set(['aberto', 'em_contagem', 'aguarda_aprovacao'])

export function InventoryPage() {
  const { push } = useToast()
  const { user } = useOutletContext<AppOutletContext>()
  const isAdmin = user.role === 'admin'
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [cancelling, setCancelling] = useState<InventorySession | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      setSessions(await unwrap(api.listInventorySessions()))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível carregar os inventários físicos', 'err')
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  const active = useMemo(() => sessions.find((s) => ACTIVE_STATUSES.has(s.status)), [sessions])
  const history = useMemo(() => sessions.filter((s) => !ACTIVE_STATUSES.has(s.status)), [sessions])
  const allCounted = active ? active.counts.every((c) => c.countedStock !== null) : false

  useEffect(() => {
    if (!active) {
      setCounts({})
      return
    }
    setCounts((current) => {
      const next = { ...current }
      active.counts.forEach((count) => {
        if (next[count.productId] === undefined) {
          next[count.productId] = count.countedStock === null ? '' : String(count.countedStock)
        }
      })
      return next
    })
  }, [active])

  async function startSession(e: FormEvent) {
    e.preventDefault()
    try {
      await unwrap(api.openInventorySession(notes))
      push('Contagem de inventário iniciada')
      setOpen(false)
      setNotes('')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível iniciar a contagem', 'err')
    }
  }

  async function saveCount(sessionId: string, productId: string) {
    const raw = counts[productId]
    const value = Number(raw)
    if (!raw || !Number.isFinite(value) || value < 0) {
      push('Informe um saldo contado válido (≥ 0)', 'err')
      return
    }
    try {
      const updated = await unwrap(api.recordInventoryCount(sessionId, productId, value))
      setSessions((current) => current.map((s) => (s.id === updated.id ? updated : s)))
      push('Contagem registada')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível registar a contagem', 'err')
    }
  }

  async function submit(sessionId: string) {
    try {
      await unwrap(api.submitInventorySession(sessionId))
      push('Contagem submetida para aprovação')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível submeter a contagem', 'err')
    }
  }

  async function approve(sessionId: string) {
    try {
      await unwrap(api.approveInventorySession(sessionId))
      push('Inventário aprovado e stock ajustado com sucesso')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível aprovar o inventário', 'err')
    }
  }

  async function cancel(e: FormEvent) {
    e.preventDefault()
    if (!cancelling) return
    try {
      await unwrap(api.cancelInventorySession(cancelling.id, cancelReason))
      push('Inventário cancelado')
      setCancelling(null)
      setCancelReason('')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível cancelar o inventário', 'err')
    }
  }

  return (
    <div className="collection-page" data-testid="inventory-page">
      <CollectionPageHeader
        icon="☑"
        description="Concilie o stock do sistema com a contagem física e aprove os ajustes com histórico completo."
        count={sessions.length}
        singular="sessão de inventário"
        plural="sessões de inventário"
      >
        <button
          className="btn btn-primary"
          data-testid="btn-new-inventory"
          onClick={() => {
            setNotes('')
            setOpen(true)
          }}
          disabled={Boolean(active)}
          title={active ? 'Já existe uma contagem em curso' : undefined}
        >
          <span aria-hidden>+</span>
          Iniciar contagem
        </button>
      </CollectionPageHeader>

      {active ? (
        <div className="panel">
          <div className="section-header">
            <div>
              <h3>Contagem {active.code}</h3>
              <p className="muted">
                <span className={`badge ${inventoryStatusBadgeClass(active.status)}`}>{inventoryStatusLabel(active.status)}</span>{' '}
                · {active.counts.filter((c) => c.countedStock !== null).length} de {active.counts.length} produtos contados
              </p>
            </div>
            <div className="row-actions">
              {active.status !== 'aguarda_aprovacao' ? (
                <button type="button" className="btn btn-primary" disabled={!allCounted} onClick={() => void submit(active.id)}>
                  Submeter para aprovação
                </button>
              ) : null}
              {active.status === 'aguarda_aprovacao' && isAdmin ? (
                <button type="button" className="btn btn-primary" onClick={() => void approve(active.id)}>
                  Aprovar
                </button>
              ) : null}
              {isAdmin ? (
                <button type="button" className="btn btn-danger" onClick={() => { setCancelling(active); setCancelReason('') }}>
                  Cancelar contagem
                </button>
              ) : null}
            </div>
          </div>

          <div className="table-wrap">
            <table className="collection-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Saldo no sistema</th>
                  <th>Saldo contado</th>
                  <th>Diferença</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {active.counts.map((count) => (
                  <tr key={count.productId}>
                    <td>{count.productSku} · {count.productName}</td>
                    <td>{formatNumber(count.referenceStock)} {count.unit}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.00001"
                        value={counts[count.productId] ?? ''}
                        onChange={(e) => setCounts((current) => ({ ...current, [count.productId]: e.target.value }))}
                        disabled={active.status === 'aguarda_aprovacao'}
                      />
                    </td>
                    <td>{count.difference === null ? '—' : formatNumber(count.difference)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        disabled={active.status === 'aguarda_aprovacao'}
                        onClick={() => void saveCount(active.id, count.productId)}
                      >
                        Salvar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel panel-flush">
        {history.length === 0 ? (
          <CollectionEmpty
            icon="☑"
            title="Ainda não existem inventários concluídos"
            description="Inicie uma contagem para conciliar o stock físico com o sistema."
          />
        ) : (
          <div className="table-wrap">
            <table className="collection-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Abertura</th>
                  <th>Estado</th>
                  <th>Produtos</th>
                  <th>Contados</th>
                  <th>Aprovação</th>
                </tr>
              </thead>
              <tbody>
                {history.map((session) => (
                  <tr key={session.id}>
                    <td>{session.code}</td>
                    <td>{formatDateTime(session.createdAt)}</td>
                    <td>
                      <span className={`badge ${inventoryStatusBadgeClass(session.status)}`}>{inventoryStatusLabel(session.status)}</span>
                    </td>
                    <td>{session.counts.length}</td>
                    <td>{session.counts.filter((c) => c.countedStock !== null).length}</td>
                    <td>{session.approvedAt ? formatDateTime(session.approvedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <ModalForm
          title="Iniciar contagem de inventário"
          hint="Todos os produtos ativos entram na contagem com o saldo atual do sistema como referência."
          onClose={() => setOpen(false)}
          onSubmit={startSession}
          submitLabel="Iniciar contagem"
        >
          <div className="field full">
            <label htmlFor="inv-session-notes">Observações</label>
            <textarea id="inv-session-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </ModalForm>
      ) : null}

      {cancelling ? (
        <ModalForm
          title={`Cancelar contagem ${cancelling.code}`}
          hint="O cancelamento não altera o stock e fica registado no histórico. Esta ação não pode ser desfeita."
          onClose={() => setCancelling(null)}
          onSubmit={cancel}
          submitLabel="Confirmar cancelamento"
          cancelLabel="Voltar"
        >
          <div className="field full">
            <label htmlFor="inv-cancel-reason">Motivo do cancelamento *</label>
            <textarea
              id="inv-cancel-reason"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex.: contagem iniciada por engano"
            />
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
