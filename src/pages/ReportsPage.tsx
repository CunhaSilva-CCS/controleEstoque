import { useCallback, useEffect, useState } from 'react'
import { api, unwrap } from '../lib/api'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { useToast } from '../lib/toast'
import { formatCurrency, formatNumber } from '../lib/format'
import type { ReportType } from '@shared/types'

const reports: Record<ReportType, { label: string; description: string; period: boolean }> = {
  posicao: { label: 'Posição de stock', description: 'Saldos, custos e valor atual de cada produto.', period: false },
  movimentacoes: { label: 'Movimentações de stock', description: 'Histórico detalhado de entradas, saídas e ajustes.', period: true },
  baixo: { label: 'Stock baixo ou esgotado', description: 'Produtos que exigem reposição ou atenção imediata.', period: false },
  'custo-venda': { label: 'Produto — Custo x Venda', description: 'Comparação de preços e margem potencial dos produtos finais.', period: false },
  compras: { label: 'Compras detalhadas', description: 'Matérias-primas compradas, fornecedores, custos e totais.', period: true },
  vendas: { label: 'Vendas detalhadas', description: 'Produtos vendidos, clientes, preços e valores faturados.', period: true },
  'margem-vendas': { label: 'Margem das vendas', description: 'Receita, custo histórico e margem efetivamente realizada.', period: true },
  producao: { label: 'Produção e custos', description: 'Quantidades fabricadas e custos registados em cada produção.', period: true },
  clientes: { label: 'Desempenho por cliente', description: 'Faturação, volume vendido e margem acumulada por cliente.', period: false },
  fornecedores: { label: 'Compras por fornecedor', description: 'Volume comprado, número de faturas e última compra.', period: false },
  auditoria: { label: 'Auditoria administrativa', description: 'Utilizadores, ações, alterações e computador de origem.', period: true },
  inventarios: { label: 'Inventários físicos', description: 'Sessões, contagens, diferenças e aprovações de inventário.', period: false },
}

const currencyColumns = new Set(['Custo', 'Valor', 'Preço de custo', 'Preço de venda', 'Diferença', 'Custo unitário', 'Total da compra', 'Preço unitário', 'Total faturado', 'Receita', 'Margem bruta', 'Custo total da produção', 'Valor comprado', 'Custo associado'])
const quantityColumns = new Set(['Saldo', 'Mínimo', 'Quantidade', 'Saldo anterior', 'Saldo novo', 'Quantidade produzida', 'Unidades vendidas', 'Unidades compradas'])

function formatReportValue(_type: ReportType, column: string, value: string | number | boolean | null) {
  if (typeof value !== 'number') {
    if ((column === 'Data' || column === 'Última compra') && value) return new Date(String(value).length === 10 ? `${value}T12:00:00` : String(value)).toLocaleDateString('pt-PT')
    return String(value ?? '')
  }
  if (currencyColumns.has(column)) return formatCurrency(value)
  if (column === 'Margem' || column === 'Margem %') return `${value.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  if (quantityColumns.has(column)) return formatNumber(value)
  return String(value)
}

export function ReportsPage() {
  const { push } = useToast()
  const [type, setType] = useState<ReportType>('posicao')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string | number | boolean | null>[]>([])
  const selectedReport = reports[type]
  const summaryColumns = columns.filter((column) => currencyColumns.has(column))
  const summaryValues = summaryColumns.slice(-2).map((column) => ({
    column,
    value: rows.reduce((sum, row) => sum + (typeof row[column] === 'number' ? Number(row[column]) : 0), 0),
  }))

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
      push(err instanceof Error ? err.message : 'Não foi possível gerar o relatório', 'err')
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
      if (result.saved) push('Relatório exportado com sucesso')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível exportar o relatório', 'err')
    }
  }

  return (
    <div className="collection-page reports-page" data-testid="reports-page">
      <CollectionPageHeader icon="▥" description="Analise os dados da operação e exporte as informações para conferência." count={rows.length} singular="linha no relatório" plural="linhas no relatório">
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
            {(Object.keys(reports) as ReportType[]).map((key) => (
              <option key={key} value={key}>
                {reports[key].label}
              </option>
            ))}
          </select>
        </div>
        {selectedReport.period ? (
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

      <div className="report-context panel">
        <div><span className="report-context-label">Relatório selecionado</span><strong>{selectedReport.label}</strong><p>{selectedReport.description}</p></div>
        <div className="report-summary"><div><span>Registos</span><strong>{rows.length}</strong></div>{summaryValues.map((summary) => <div key={summary.column}><span>{summary.column}</span><strong>{formatCurrency(summary.value)}</strong></div>)}</div>
      </div>

      <div className="panel panel-flush">
        {rows.length === 0 ? (
          <CollectionEmpty icon="▥" title="Não há dados para exibir" description="Escolha outro relatório ou ajuste o período da consulta." />
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
