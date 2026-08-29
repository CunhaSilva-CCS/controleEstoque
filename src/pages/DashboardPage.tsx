import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import {
  DonutChart,
  HorizontalBarList,
  MiniBarChart,
  MovementStackedChart,
} from '../components/dashboard/DashboardCharts'
import { DashboardMetricCard } from '../components/dashboard/DashboardMetricCard'
import type { AppOutletContext } from '../components/AppLayout'
import { api, unwrap } from '../lib/api'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  movementLabel,
  productKindLabel,
} from '../lib/format'
import { useToast } from '../lib/toast'
import type { DashboardData, DashboardFinancialSummary } from '@shared/types'

type Props = {
  needsSeed: boolean
  onSeedDone: () => void
}

type PeriodKey = 'today' | 'week' | 'month'

const periodLabels: Record<PeriodKey, string> = {
  today: 'Hoje',
  week: '7 dias',
  month: '30 dias',
}

const activityLabels: Record<DashboardData['recentActivity'][number]['type'], string> = {
  compra: 'Compra',
  venda: 'Venda',
  producao: 'Fabrico',
  inventario: 'Inventário',
  movimento: 'Movimento',
}

const activityLinks: Partial<Record<DashboardData['recentActivity'][number]['type'], string>> = {
  compra: '/faturas',
  venda: '/faturacao/saida',
  producao: '/fabricacao',
  inventario: '/inventario-fisico',
  movimento: '/movimentacoes',
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`
}

function financialCards(financials: DashboardFinancialSummary, period: PeriodKey) {
  const label = periodLabels[period]
  return [
    {
      icon: '€',
      label: `Vendas (${label})`,
      value: formatCurrency(financials.salesRevenue),
      hint: `${financials.salesInvoices} fatura(s) emitida(s)`,
      tone: 'sales' as const,
    },
    {
      icon: '↓',
      label: `Compras (${label})`,
      value: formatCurrency(financials.purchaseSpend),
      hint: `${financials.purchaseInvoices} fatura(s) registada(s)`,
      tone: 'purchase' as const,
    },
    {
      icon: '◆',
      label: `Margem bruta (${label})`,
      value: formatCurrency(financials.grossMargin),
      hint: formatPercent(financials.grossMarginPercent),
      tone: 'value' as const,
    },
    {
      icon: '⚙',
      label: `Fabrico (${label})`,
      value: formatNumber(financials.productionUnits),
      hint: `${formatCurrency(financials.productionCost)} em custo`,
      tone: 'production' as const,
    },
  ]
}

export function DashboardPage({ needsSeed, onSeedDone }: Props) {
  const { user } = useOutletContext<AppOutletContext>()
  const isAdmin = user.role === 'admin'
  const { push } = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodKey>('month')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await unwrap(api.getDashboard()))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível carregar o painel', 'err')
    } finally {
      setLoading(false)
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  const financials = useMemo(() => {
    if (!data) return null
    return data.financials[period]
  }, [data, period])

  async function handleSeed(accept: boolean) {
    try {
      await unwrap(api.seed(accept))
      onSeedDone()
      await load()
      push(accept ? 'Dados de demonstração prontos a utilizar' : 'Tudo pronto para começar com o stock vazio')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível preparar os dados de demonstração', 'err')
    }
  }

  return (
    <div className="dashboard-shell" data-testid="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <span className="dashboard-eyebrow">Centro de controlo</span>
          <h2 className="dashboard-title">Painel operacional</h2>
          <p className="dashboard-subtitle">
            Visão completa do stock, vendas, compras e fabrico — actualizada em tempo real.
          </p>
        </div>
        <div className="dashboard-topbar-actions">
          <div className="dash-period-tabs" role="tablist" aria-label="Período financeiro">
            {(Object.keys(periodLabels) as PeriodKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={period === key}
                className={period === key ? 'active' : undefined}
                onClick={() => setPeriod(key)}
              >
                {periodLabels[key]}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={() => void load()}>
            Atualizar
          </button>
        </div>
      </header>

      {needsSeed && isAdmin ? (
        <div className="seed-banner" data-testid="seed-banner">
          <div>
            <strong>Primeiro uso</strong>
            <p className="muted seed-banner-text">
              Você pode carregar dados de exemplo para conhecer o fluxo completo do sistema.
            </p>
          </div>
          <div className="row-actions">
            <button className="btn btn-ghost" data-testid="btn-seed-skip" onClick={() => void handleSeed(false)}>
              Começar sem dados
            </button>
            <button className="btn btn-primary" data-testid="btn-seed-accept" onClick={() => void handleSeed(true)}>
              Carregar demonstração
            </button>
          </div>
        </div>
      ) : null}

      {loading || !data || !financials ? (
        <div className="panel empty">Carregando indicadores…</div>
      ) : (
        <>
          <section className="dashboard-quick-actions" aria-label="Ações rápidas">
            <Link className="dashboard-action" to="/faturas">
              <span>+</span>
              Fatura de entrada
            </Link>
            <Link className="dashboard-action" to="/faturacao/saida">
              <span>+</span>
              Fatura de saída
            </Link>
            <Link className="dashboard-action" to="/fabricacao">
              <span>+</span>
              Registar fabrico
            </Link>
            <Link className="dashboard-action" to="/inventario-fisico">
              Inventário físico
            </Link>
            <Link className="dashboard-action" to="/relatorios">
              Relatórios
            </Link>
          </section>

          {data.alerts.length > 0 ? (
            <section className="dash-alerts" aria-label="Alertas">
              {data.alerts.map((alert) => (
                <div key={alert.id} className={`dash-alert dash-alert-${alert.severity}`}>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.message}</p>
                  </div>
                  {alert.link ? (
                    <Link className="btn btn-ghost btn-sm" to={alert.link}>
                      Ver
                    </Link>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          <section className="dashboard-metrics dashboard-metrics-wide">
            <DashboardMetricCard
              icon="▦"
              label="Produtos ativos"
              value={String(data.activeProducts)}
              hint={`${data.insumoCount} insumos · ${data.acabadoCount} acabados`}
            />
            <DashboardMetricCard
              icon="$"
              label="Valor em stock"
              value={formatCurrency(data.totalStockValue)}
              hint="Estimativa com base nos saldos actuais"
              tone="value"
            />
            <DashboardMetricCard
              icon="!"
              label="Stock crítico"
              value={`${data.lowStockCount} / ${data.zeroStockCount}`}
              hint="Baixo / esgotado"
              tone="alert"
            />
            <DashboardMetricCard
              icon="↕"
              label="Movimentações hoje"
              value={String(data.movementsToday)}
              hint={`${financials.movementsCount} no período seleccionado`}
              tone="movement"
            />
          </section>

          <section className="dashboard-metrics dashboard-metrics-wide">
            {financialCards(financials, period).map((card) => (
              <DashboardMetricCard key={card.label} {...card} />
            ))}
          </section>

          <div className="dashboard-layout">
            <div className="dashboard-main">
              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Tendência de vendas</h3>
                    <p>Receita diária — últimos 14 dias</p>
                  </div>
                </div>
                <MiniBarChart data={data.salesTrend} color="var(--ok-text)" formatValue={formatCurrency} />
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Tendência de compras</h3>
                    <p>Valor diário — últimos 14 dias</p>
                  </div>
                </div>
                <MiniBarChart data={data.purchaseTrend} color="#0369a1" formatValue={formatCurrency} />
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Movimentações diárias</h3>
                    <p>Entradas, saídas e ajustes — últimos 14 dias</p>
                  </div>
                  <div className="dash-chart-legend-inline">
                    <span><i className="dot dot-ok" /> Entrada</span>
                    <span><i className="dot dot-danger" /> Saída</span>
                    <span><i className="dot dot-warn" /> Ajuste</span>
                  </div>
                </div>
                <MovementStackedChart data={data.movementTrend} />
              </section>

              <section className="panel dashboard-critical">
                <div className="section-header">
                  <div>
                    <h3>Stock crítico</h3>
                    <p>Produtos com saldo ≤ mínimo</p>
                  </div>
                  <Link className="btn btn-ghost" to="/produtos?low=1">
                    Ver todos
                  </Link>
                </div>
                {data.criticalProducts.length === 0 ? (
                  <div className="empty">Tudo em ordem: não existem artigos com stock crítico.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Produto</th>
                          <th>Tipo</th>
                          <th>Saldo</th>
                          <th>Mín.</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.criticalProducts.map((product) => (
                          <tr key={product.id}>
                            <td>{product.sku}</td>
                            <td>{product.name}</td>
                            <td>{productKindLabel(product.kind)}</td>
                            <td>
                              {formatNumber(product.stock)} {product.unit}
                            </td>
                            <td>{formatNumber(product.minStock)}</td>
                            <td>
                              <StatusBadge status={product.status} />
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
                    <p>Histórico recente de stock</p>
                  </div>
                  <Link className="btn btn-ghost" to="/movimentacoes">
                    Ver histórico
                  </Link>
                </div>
                {data.recentMovements.length === 0 ? (
                  <div className="empty">As movimentações mais recentes aparecerão aqui.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Produto</th>
                          <th>Tipo</th>
                          <th>Qtd</th>
                          <th>Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentMovements.map((movement) => (
                          <tr key={movement.id}>
                            <td>{formatDateTime(movement.createdAt)}</td>
                            <td>{movement.productName}</td>
                            <td>
                              <span className={`badge badge-${movement.type}`}>
                                {movementLabel(movement.type)}
                              </span>
                            </td>
                            <td>{formatNumber(movement.quantity)}</td>
                            <td>{formatNumber(movement.newStock)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <aside className="dashboard-aside">
              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Saúde do stock</h3>
                    <p>Distribuição por estado</p>
                  </div>
                </div>
                <DonutChart
                  segments={[
                    { label: 'Normal', value: data.stockHealth.ok, color: 'var(--ok-text)' },
                    { label: 'Baixo', value: data.stockHealth.low, color: 'var(--warn-text)' },
                    { label: 'Zero', value: data.stockHealth.zero, color: 'var(--danger)' },
                  ]}
                />
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Registos</h3>
                    <p>Base de dados activa</p>
                  </div>
                </div>
                <dl className="dash-stats-grid">
                  <div><dt>Categorias</dt><dd>{data.categoriesCount}</dd></div>
                  <div><dt>Fornecedores</dt><dd>{data.suppliersCount}</dd></div>
                  <div><dt>Clientes</dt><dd>{data.customersCount}</dd></div>
                  <div><dt>Receitas</dt><dd>{data.recipesCount}</dd></div>
                  <div><dt>Inventários pendentes</dt><dd>{data.pendingInventoryCount}</dd></div>
                </dl>
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Stock por categoria</h3>
                    <p>Valor estimado</p>
                  </div>
                </div>
                <HorizontalBarList
                  items={data.stockByCategory.map((item) => ({
                    label: item.categoryName,
                    value: item.stockValue,
                    secondary: `${item.productCount} produto(s)`,
                  }))}
                  formatValue={formatCurrency}
                />
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Top produtos</h3>
                    <p>Maior valor em stock</p>
                  </div>
                  <Link className="btn btn-ghost btn-sm" to="/produtos">
                    Ver
                  </Link>
                </div>
                {data.topProductsByValue.length === 0 ? (
                  <div className="empty">Sem produtos com stock positivo.</div>
                ) : (
                  <ul className="dash-ranking">
                    {data.topProductsByValue.map((product, index) => (
                      <li key={product.id}>
                        <span className="dash-rank">{index + 1}</span>
                        <div>
                          <strong>{product.name}</strong>
                          <small>
                            {product.sku} · {formatNumber(product.stock)} {product.unit}
                          </small>
                        </div>
                        <span className="dash-rank-value">{formatCurrency(product.stockValue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Top clientes</h3>
                    <p>Total faturado</p>
                  </div>
                </div>
                <HorizontalBarList
                  items={data.topCustomers.map((item) => ({ label: item.name, value: item.value }))}
                  formatValue={formatCurrency}
                  color="var(--ok-text)"
                />
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Top fornecedores</h3>
                    <p>Total comprado</p>
                  </div>
                </div>
                <HorizontalBarList
                  items={data.topSuppliers.map((item) => ({ label: item.name, value: item.value }))}
                  formatValue={formatCurrency}
                  color="#0369a1"
                />
              </section>

              <section className="panel dash-panel">
                <div className="section-header">
                  <div>
                    <h3>Actividade recente</h3>
                    <p>Operações mais recentes</p>
                  </div>
                </div>
                {data.recentActivity.length === 0 ? (
                  <div className="empty">Ainda não existem operações registadas.</div>
                ) : (
                  <ul className="dash-activity">
                    {data.recentActivity.map((item) => (
                      <li key={item.id}>
                        <span className={`dash-activity-type dash-activity-${item.type}`}>
                          {activityLabels[item.type]}
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.subtitle}</small>
                        </div>
                        <div className="dash-activity-meta">
                          {item.amount != null ? <span>{formatCurrency(item.amount)}</span> : null}
                          <time>{formatDateTime(item.createdAt)}</time>
                          {activityLinks[item.type] ? (
                            <Link to={activityLinks[item.type]!}>Abrir</Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
