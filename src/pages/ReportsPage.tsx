import { useState } from 'react';
import { Toast, useToast } from '../components/ui';
import { getInventoryApi } from '../lib/api';
import { unwrap } from '../lib/format';

export function ReportsPage() {
  const api = getInventoryApi();
  const { showOk, showError, toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function exportReport(
    key: string,
    filename: string,
    loader: () => Promise<string>,
  ) {
    setBusy(key);
    try {
      const csv = await loader();
      const saved = await unwrap(api.saveCsvFile(filename, csv));
      showOk(saved ? `Arquivo salvo: ${saved}` : 'Exportação concluída.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Falha na exportação');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Exportações CSV (fluxo F9) com BOM para Excel.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Inventário completo</h2>
          <p style={{ color: 'var(--ink-muted)' }}>
            Todos os produtos com saldo, custos, status e flag de crítico.
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() =>
              void exportReport('inv', 'inventario.csv', async () =>
                unwrap(api.exportInventoryCsv()),
              )
            }
          >
            {busy === 'inv' ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </section>

        <section className="panel">
          <h2>Estoque crítico</h2>
          <p style={{ color: 'var(--ink-muted)' }}>
            Produtos ativos com saldo ≤ estoque mínimo (fluxo F7).
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() =>
              void exportReport('crit', 'estoque-critico.csv', async () =>
                unwrap(api.exportCriticalCsv()),
              )
            }
          >
            {busy === 'crit' ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </section>

        <section className="panel">
          <h2>Movimentações</h2>
          <p style={{ color: 'var(--ink-muted)' }}>
            Histórico recente (até 500 registros) com saldos antes/depois.
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() =>
              void exportReport('mov', 'movimentos.csv', async () =>
                unwrap(api.exportMovementsCsv()),
              )
            }
          >
            {busy === 'mov' ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </section>
      </div>
    </div>
  );
}
