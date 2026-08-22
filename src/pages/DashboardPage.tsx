import { useCallback, useEffect, useState } from 'react';
import { getInventoryApi } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber, unwrap } from '../lib/format';
import type { DashboardData } from '../types/inventory';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const api = getInventoryApi();
      setData(await unwrap(api.getDashboard()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dashboard');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return <div className="panel">Carregando dashboard…</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Visão operacional do estoque, alertas e movimentos recentes.</p>
        </div>
        <button type="button" className="btn secondary" onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Produtos ativos</span>
          <strong>{data.active_products}</strong>
        </div>
        <div className="stat">
          <span>Unidades em estoque</span>
          <strong>{formatNumber(data.total_units)}</strong>
        </div>
        <div className="stat">
          <span>Valor a custo</span>
          <strong>{formatMoney(data.inventory_cost_value)}</strong>
        </div>
        <div className="stat">
          <span>Alertas de estoque</span>
          <strong>{data.low_stock_count}</strong>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Estoque crítico</h2>
          {data.critical_products.length === 0 ? (
            <p className="empty">Nenhum produto abaixo do mínimo.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Saldo</th>
                  <th>Mín.</th>
                </tr>
              </thead>
              <tbody>
                {data.critical_products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>{p.name}</td>
                    <td>
                      <span className="badge warn">
                        {formatNumber(p.quantity_on_hand)} {p.unit}
                      </span>
                    </td>
                    <td>{formatNumber(p.min_stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h2>Movimentos recentes</h2>
          {data.recent_movements.length === 0 ? (
            <p className="empty">Sem movimentos registrados.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_movements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.created_at)}</td>
                    <td>
                      <span className={`badge ${m.type.toLowerCase()}`}>{m.type}</span>
                    </td>
                    <td>
                      {m.product_sku} — {m.product_name}
                    </td>
                    <td>{formatNumber(m.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Valor potencial de venda</h2>
        <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
          Inventário avaliado a preço de venda: <strong>{formatMoney(data.inventory_sale_value)}</strong>
        </p>
      </section>
    </div>
  );
}
