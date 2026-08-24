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
          <div className="stats">
            <div className="stat">
              <span>Produtos ativos</span>
              <strong>{data.activeProducts}</strong>
            </div>
            <div className="stat">
              <span>Valor em estoque</span>
              <strong>{formatCurrency(data.totalStockValue)}</strong>
            </div>
            <div className="stat">
              <span>Estoque baixo / zerado</span>
              <strong>
                {data.lowStockCount} / {data.zeroStockCount}
              </strong>
            </div>
            <div className="stat">
              <span>Movimentações hoje</span>
              <strong>{data.movementsToday}</strong>
            </div>
          </div>

          <div className="grid-2">
            <section className="panel">
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

            <section className="panel">
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
