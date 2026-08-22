import { useCallback, useEffect, useState } from 'react';
import { Modal, Toast, useToast } from '../components/ui';
import { getInventoryApi } from '../lib/api';
import { unwrap } from '../lib/format';
import type { Category, CategoryInput } from '../types/inventory';

const empty: CategoryInput = { name: '', description: '' };

export function CategoriesPage() {
  const api = getInventoryApi();
  const { showOk, showError, toast } = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CategoryInput>(empty);

  const load = useCallback(async () => {
    try {
      setItems(await unwrap(api.listCategories(includeInactive)));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao listar categorias');
    }
  }, [api, includeInactive, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    try {
      if (editing) {
        await unwrap(api.updateCategory(editing.id, form));
        showOk('Categoria atualizada.');
      } else {
        await unwrap(api.createCategory(form));
        showOk('Categoria criada.');
      }
      setCreating(false);
      setEditing(null);
      setForm(empty);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className="page-header">
        <div>
          <h1>Categorias</h1>
          <p>Organize o catálogo (fluxo F1).</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCreating(true);
            setEditing(null);
            setForm(empty);
          }}
        >
          Nova categoria
        </button>
      </div>

      <div className="toolbar">
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Incluir inativas
        </label>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.description || '—'}</td>
                <td>
                  <span className={`badge ${c.active ? 'ok' : 'muted'}`}>
                    {c.active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setEditing(c);
                      setCreating(true);
                      setForm({ name: c.name, description: c.description });
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      void (async () => {
                        try {
                          await unwrap(api.setCategoryActive(c.id, !c.active));
                          showOk(c.active ? 'Categoria desativada.' : 'Categoria reativada.');
                          await load();
                        } catch (err) {
                          showError(err instanceof Error ? err.message : 'Falha');
                        }
                      })();
                    }}
                  >
                    {c.active ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {creating && (
        <Modal
          title={editing ? 'Editar categoria' : 'Nova categoria'}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        >
          <div className="form-grid">
            <label className="full">
              Nome
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </label>
            <label className="full">
              Descrição
              <textarea
                rows={3}
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={() => void save()}>
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
