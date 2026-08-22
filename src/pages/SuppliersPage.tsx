import { useCallback, useEffect, useState } from 'react';
import { Modal, Toast, useToast } from '../components/ui';
import { getInventoryApi } from '../lib/api';
import { unwrap } from '../lib/format';
import type { Supplier, SupplierInput } from '../types/inventory';

const empty: SupplierInput = {
  name: '',
  document: '',
  phone: '',
  email: '',
  notes: '',
};

export function SuppliersPage() {
  const api = getInventoryApi();
  const { showOk, showError, toast } = useToast();
  const [items, setItems] = useState<Supplier[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierInput>(empty);

  const load = useCallback(async () => {
    try {
      setItems(await unwrap(api.listSuppliers(includeInactive)));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao listar fornecedores');
    }
  }, [api, includeInactive, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    try {
      if (editing) {
        await unwrap(api.updateSupplier(editing.id, form));
        showOk('Fornecedor atualizado.');
      } else {
        await unwrap(api.createSupplier(form));
        showOk('Fornecedor criado.');
      }
      setOpen(false);
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
          <h1>Fornecedores</h1>
          <p>Cadastro para entradas e reposição (fluxo F2).</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setEditing(null);
            setForm(empty);
            setOpen(true);
          }}
        >
          Novo fornecedor
        </button>
      </div>

      <div className="toolbar">
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Incluir inativos
        </label>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Contato</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.document || '—'}</td>
                <td>
                  {s.phone || '—'}
                  <br />
                  <span style={{ color: 'var(--ink-muted)' }}>{s.email || ''}</span>
                </td>
                <td>
                  <span className={`badge ${s.active ? 'ok' : 'muted'}`}>
                    {s.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setEditing(s);
                      setForm({
                        name: s.name,
                        document: s.document,
                        phone: s.phone,
                        email: s.email,
                        notes: s.notes,
                      });
                      setOpen(true);
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
                          await unwrap(api.setSupplierActive(s.id, !s.active));
                          showOk(s.active ? 'Fornecedor desativado.' : 'Fornecedor reativado.');
                          await load();
                        } catch (err) {
                          showError(err instanceof Error ? err.message : 'Falha');
                        }
                      })();
                    }}
                  >
                    {s.active ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {open && (
        <Modal title={editing ? 'Editar fornecedor' : 'Novo fornecedor'} onClose={() => setOpen(false)}>
          <div className="form-grid">
            <label className="full">
              Nome
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Documento
              <input
                value={form.document ?? ''}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
              />
            </label>
            <label>
              Telefone
              <input
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="full">
              E-mail
              <input
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="full">
              Observações
              <textarea
                rows={3}
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
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
