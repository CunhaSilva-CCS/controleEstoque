import { useCallback, useEffect, useState } from 'react'
import { api, unwrap } from '../lib/api'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { useToast } from '../lib/toast'
import { formatCurrency, formatNumber } from '../lib/format'
import type { ReportType } from '@shared/types'

const labels: Record<ReportType, string> = {
  posicao: 'Posição de estoque',
  movimentacoes: 'Movimentações',
  baixo: 'Estoque baixo / zerado',
  'custo-venda': 'Produto - Custo x Venda',
}

function formatReportValue(type: ReportType, column: string, value: string | number | boolean | null) {
  if (type !== 'custo-venda' || typeof value !== 'number') return String(value ?? '')
  if (['Preço de custo', 'Preço de venda', 'Diferença'].includes(column)) return formatCurrency(value)
  if (column === 'Margem') return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  if (column === 'Saldo') return formatNumber(value)
  return String(value)
}

export function ReportsPage() {
  const { push } = useToast()
  const [type, setType] = useState<ReportType>('posicao')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string | number | boolean | null>[]>([])

  const load = useCallback(async () => {
    try {
      const report = await unwrap(
        api.getReport(type, {
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        }),
      )
      setColumns(report.columns)
      setRows(report.rows)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao gerar relatório', 'err')
    }
  }, [type, from, to, push])

  useEffect(() => {
    void load()
  }, [load])

  async function exportCsv() {
    try {
      const result = await unwrap(
        api.exportReportCsv({
          type,
          filters: {
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          },
          defaultName: `relatorio-${type}-${new Date().toISOString().slice(0, 10)}.csv`,
        }),
      )
      if (result.saved) push('Relatório exportado')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha na exportação', 'err')
    }
  }

  return (
    <div className="collection-page reports-page" data-testid="reports-page">
      <CollectionPageHeader icon="▥" description="Consultas gerenciais, conferência de dados e exportação em CSV." count={rows.length} singular="linha no relatório" plural="linhas no relatório">
        <button className="btn btn-primary" onClick={() => void exportCsv()}>
          Exportar CSV
        </button>
      </CollectionPageHeader>

      <div className="toolbar collection-toolbar reports-toolbar">
        <div className="field-inline">
          <label htmlFor="rtype">Tipo</label>
          <select
            id="rtype"
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
          >
            {(Object.keys(labels) as ReportType[]).map((key) => (
              <option key={key} value={key}>
                {labels[key]}
              </option>
            ))}
          </select>
        </div>
        {type === 'movimentacoes' ? (
          <>
            <div className="field-inline">
              <label htmlFor="rfrom">De</label>
              <input
                id="rfrom"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field-inline">
              <label htmlFor="rto">Até</label>
              <input id="rto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        ) : null}
      </div>

      <div className="panel panel-flush">
        {rows.length === 0 ? (
          <CollectionEmpty icon="▥" title="Sem dados para este relatório" description="Selecione outro relatório ou altere o período consultado." />
        ) : (
          <div className="table-wrap">
            <table className={`collection-table reports-table ${type === 'custo-venda' ? 'control-table' : ''}`}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    {columns.map((c) => (
                      <td key={c}>{formatReportValue(type, c, row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
