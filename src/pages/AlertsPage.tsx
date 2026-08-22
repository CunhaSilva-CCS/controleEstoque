import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { StatusBadge } from '../components/StatusBadge'
import { useAlerts } from '../lib/alerts'
import { api, unwrap } from '../lib/api'
import { formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { AlertSeverityFilter, AlertsSummary, Product, StockAlert } from '@shared/types'

export function AlertsPage() {
  const { push } = useToast()
  const { refresh: refreshGlobal } = useAlerts()
  const [severity, setSeverity] = useState<AlertSeverityFilter>('all')
  const [summary, setSummary] = useState<AlertsSummary | null>(null)
  const [minModal, setMinModal] = useState<Product | null>(null)
  const [minValue, setMinValue] = useState('0')
  const [entryModal, setEntryModal] = useState<StockAlert | null>(null)
  const [entryQty, setEntryQty] = useState('1')
  const [entryReason, setEntryReason] = useState('Reposição por estoque mínimo')

  const load = useCallback(async () => {
    try {
      const data = await unwrap(api.getAlerts(severity))
      setSummary(data)
      await refreshGlobal()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar alertas', 'err')
    }
  }, [severity, push, refreshGlobal])

  useEffect(() => {
    void load()
  }, [load])

  function openMin(product: Product) {
    setMinModal(product)
    setMinValue(String(product.minStock))
  }

  async function saveMin(e: FormEvent) {
    e.preventDefault()
    if (!minModal) return
    try {
      await unwrap(api.updateMinStock(minModal.id, Number(minValue)))
      push('Estoque mínimo atualizado')
      setMinModal(null)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao atualizar mínimo', 'err')
    }
  }

  function openEntry(alert: StockAlert) {
    setEntryModal(alert)
    setEntryQty(String(Math.max(1, alert.suggestedReorder)))
    setEntryReason('Reposição por estoque mínimo')
  }

  async function saveEntry(e: FormEvent) {
    e.preventDefault()
    if (!entryModal) return
    try {
      await unwrap(
        api.createMovement({
          productId: entryModal.product.id,
          type: 'entrada',
          quantity: Number(entryQty),
          reason: entryReason,
          reference: 'ALERTA-MIN',
        }),
      )
      push(`Entrada registrada em ${entryModal.product.name}`)
      setEntryModal(null)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha na entrada', 'err')
    }
  }

  const items = summary?.items ?? []

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Alertas de estoque</h2>
          <p>Controle de produtos com saldo no ou abaixo do estoque mínimo</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="stat">
          <span>Total em alerta</span>
          <strong>{summary?.total ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Estoque baixo</span>
          <strong>{summary?.lowCount ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Zerados</span>
          <strong>{summary?.zeroCount ?? 0}</strong>
        </div>
      </div>

      <div className="panel alert-rules">
        <h3>Como funciona o estoque mínimo</h3>
        <ul>
          <li>
            Cada produto tem um <strong>estoque mínimo</strong> definido no cadastro.
          </li>
          <li>
            Status <span className="badge badge-low">Baixo</span> quando{' '}
            <code>0 &lt; saldo ≤ mínimo</code>.
          </li>
          <li>
            Status <span className="badge badge-zero">Zerado</span> quando{' '}
            <code>saldo = 0</code>.
          </li>
          <li>
            O <strong>déficit</strong> é quanto falta para voltar ao mínimo; use na reposição.
          </li>
        </ul>
      </div>

      <div className="toolbar">
        <div className="field-inline">
          <label htmlFor="sev">Severidade</label>
          <select
            id="sev"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as AlertSeverityFilter)}
          >
            <option value="all">Todos os alertas</option>
            <option value="low">Só estoque baixo</option>
            <option value="zero">Só zerados</option>
          </select>
        </div>
        <Link className="btn btn-ghost" to="/relatorios">
          Relatório CSV
        </Link>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <div className="empty">Nenhum produto em alerta com o filtro atual</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Saldo</th>
                  <th>Mínimo</th>
                  <th>Déficit</th>
                  <th>Sugerido</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((alert) => {
                  const p = alert.product
                  return (
                    <tr key={p.id} className={p.stock <= 0 ? 'row-critical' : 'row-warn'}>
                      <td>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>
                        {formatNumber(p.stock)} {p.unit}
                      </td>
                      <td>
                        {formatNumber(p.minStock)} {p.unit}
                      </td>
                      <td>
                        <strong>{formatNumber(alert.deficit)}</strong>
                      </td>
                      <td>
                        {formatNumber(alert.suggestedReorder)} {p.unit}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-primary" onClick={() => openEntry(alert)}>
                            Repor
                          </button>
                          <button className="btn btn-ghost" onClick={() => openMin(p)}>
                            Ajustar mínimo
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {minModal ? (
        <ModalForm
          title={`Estoque mínimo · ${minModal.name}`}
          hint={`Saldo atual: ${formatNumber(minModal.stock)} ${minModal.unit}. Ao salvar, o status (OK / Baixo / Zerado) é recalculado.`}
          onClose={() => setMinModal(null)}
          onSubmit={saveMin}
        >
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="minstock">Novo estoque mínimo *</label>
              <input
                id="minstock"
                type="number"
                min="0"
                step="0.001"
                required
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}

      {entryModal ? (
        <ModalForm
          title={`Repor · ${entryModal.product.name}`}
          hint={`Déficit até o mínimo: ${formatNumber(entryModal.deficit)} ${entryModal.product.unit}. Sugestão: ${formatNumber(entryModal.suggestedReorder)}.`}
          onClose={() => setEntryModal(null)}
          onSubmit={saveEntry}
          submitLabel="Registrar entrada"
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="eqty">Quantidade *</label>
              <input
                id="eqty"
                type="number"
                min="0.001"
                step="0.001"
                required
                value={entryQty}
                onChange={(e) => setEntryQty(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="ereason">Motivo *</label>
              <input
                id="ereason"
                required
                value={entryReason}
                onChange={(e) => setEntryReason(e.target.value)}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
