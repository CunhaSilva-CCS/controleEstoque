import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import type { AppOutletContext } from '../components/AppLayout'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatDateTime, formatNumber, movementLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { DashboardData } from '@shared/types'

type Props = {
  needsSeed: boolean
  onSeedDone: () => void
}

export function DashboardPage({ needsSeed, onSeedDone }: Props) {
  const { user } = useOutletContext<AppOutletContext>()
  const isAdmin = user.role === 'admin'
  const { push } = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await unwrap(api.getDashboard()))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar o painel', 'err')
    } finally {
      setLoading(false)
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSeed(accept: boolean) {
    try {
      await unwrap(api.seed(accept))
      onSeedDone()
      await load()
      push(accept ? 'Dados de demonstração carregados' : 'Começando com estoque vazio')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao carregar demonstração', 'err')
    }
  }

  return (
    <div data-testid="dashboard-page">
      <div className="page-header">
        <p>Visão geral do estoque e alertas operacionais</p>
        <button className="btn btn-ghost" onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      {needsSeed && isAdmin ? (
        <div className="seed-banner" data-testid="seed-banner">
          <div>
            <strong>Primeiro uso</strong>
            <p className="muted seed-banner-text">
              Deseja carregar dados de demonstração para explorar o fluxo completo?
            </p>
          </div>
          <div className="row-actions">
            <button className="btn btn-ghost" data-testid="btn-seed-skip" onClick={() => void handleSeed(false)}>
              Começar vazio
            </button>
            <button className="btn btn-primary" data-testid="btn-seed-accept" onClick={() => void handleSeed(true)}>
              Carregar demonstração
            </button>
          </div>
        </div>
      ) : null}

      {loading || !data ? (
        <div className="panel empty">Carregando indicadores…</div>
      ) : (
        <>
          <section className="dashboard-hero">
            <div className="dashboard-hero-copy">
              <span className="dashboard-eyebrow">Resumo operacional</span>
              <h2>Controle do estoque</h2>
              <p>Acompanhe os saldos e acesse rapidamente as operações do dia.</p>
            </div>
            <div className="dashboard-quick-actions" aria-label="Ações rápidas">
              <Link className="dashboard-action" to="/faturas">
                <span>+</span>
                Lançar fatura
              </Link>
              <Link className="dashboard-action" to="/fabricacao">
                <span>+</span>
                Registrar fabricação
              </Link>
              <Link className="dashboard-action" to="/movimentacoes">
                Consultar movimentações
              </Link>
            </div>
          </section>

          <div className="dashboard-metrics">
            <div className="dashboard-metric metric-products">
              <span className="dashboard-metric-icon" aria-hidden="true">▦</span>
              <div>
                <span>Produtos ativos</span>
                <strong>{data.activeProducts}</strong>
                <small>itens cadastrados e disponíveis</small>
              </div>
            </div>
            <div className="dashboard-metric metric-value">
              <span className="dashboard-metric-icon" aria-hidden="true">$</span>
              <div>
                <span>Valor em estoque</span>
                <strong>{formatCurrency(data.totalStockValue)}</strong>
                <small>valor estimado dos saldos atuais</small>
              </div>
            </div>
            <div className="dashboard-metric metric-alert">
              <span className="dashboard-metric-icon" aria-hidden="true">!</span>
              <div>
                <span>Estoque baixo / zerado</span>
                <strong>{data.lowStockCount} / {data.zeroStockCount}</strong>
                <small>itens que exigem atenção</small>
              </div>
            </div>
            <div className="dashboard-metric metric-movement">
              <span className="dashboard-metric-icon" aria-hidden="true">↕</span>
              <div>
                <span>Movimentações hoje</span>
                <strong>{data.movementsToday}</strong>
                <small>entradas e saídas registradas</small>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <section className="panel dashboard-critical">
              <div className="section-header">
                <div>
                  <h3>Estoque crítico</h3>
                  <p>Produtos com saldo ≤ mínimo</p>
                </div>
                <Link className="btn btn-ghost" to="/produtos?low=1">
                  Ver todos
                </Link>
              </div>
              {data.criticalProducts.length === 0 ? (
                <div className="empty">Nenhum alerta no momento</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Saldo</th>
                        <th>Mín.</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.criticalProducts.map((p) => (
                        <tr key={p.id}>
                          <td>{p.sku}</td>
                          <td>{p.name}</td>
                          <td>
                            {formatNumber(p.stock)} {p.unit}
                          </td>
                          <td>{formatNumber(p.minStock)}</td>
                          <td>
                            <StatusBadge status={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel dashboard-movements">
              <div className="section-header">
                <div>
                  <h3>Últimas movimentações</h3>
                  <p>Histórico recente</p>
                </div>
                <Link className="btn btn-ghost" to="/movimentacoes">
                  Abrir
                </Link>
              </div>
              {data.recentMovements.length === 0 ? (
                <div className="empty">Sem movimentações ainda</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Produto</th>
                        <th>Tipo</th>
                        <th>Qtd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentMovements.map((m) => (
                        <tr key={m.id}>
                          <td>{formatDateTime(m.createdAt)}</td>
                          <td>{m.productName}</td>
                          <td>
                            <span className={`badge badge-${m.type}`}>
                              {movementLabel(m.type)}
                            </span>
                          </td>
                          <td>{formatNumber(m.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
