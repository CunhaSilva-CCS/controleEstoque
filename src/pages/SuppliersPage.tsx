import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, unwrap } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Supplier } from '@shared/types'

type FormState = {
  name: string
  document: string
  phone: string
  email: string
  notes: string
}

const empty: FormState = {
  name: '',
  document: '',
  phone: '',
  email: '',
  notes: '',
}

export function SuppliersPage() {
  const { push } = useToast()
  const [items, setItems] = useState<Supplier[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<FormState>(empty)

  const load = useCallback(async () => {
    try {
      setItems(await unwrap(api.listSuppliers()))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao listar fornecedores', 'err')
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(empty)
    setOpen(true)
  }

  function openEdit(s: Supplier) {
    setEditing(s)
    setForm({
      name: s.name,
      document: s.document,
      phone: s.phone,
      email: s.email,
      notes: s.notes,
    })
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      if (editing) {
        await unwrap(
          api.updateSupplier({
            id: editing.id,
            ...form,
            active: editing.active,
          }),
        )
        push('Fornecedor atualizado')
      } else {
        await unwrap(api.createSupplier(form))
        push('Fornecedor cadastrado')
      }
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao salvar', 'err')
    }
  }

  async function toggle(s: Supplier) {
    try {
      await unwrap(
        api.updateSupplier({
          id: s.id,
          name: s.name,
          document: s.document,
          phone: s.phone,
          email: s.email,
          notes: s.notes,
          active: !s.active,
        }),
      )
      push(s.active ? 'Fornecedor inativado' : 'Fornecedor reativado')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao alterar status', 'err')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Fornecedores</h2>
          <p>Cadastro de parceiros de compra</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          Novo fornecedor
        </button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <div className="empty">Nenhum fornecedor cadastrado</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Documento</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.document || '—'}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td>
                      <span className={`badge ${s.active ? 'badge-ok' : 'badge-zero'}`}>
                        {s.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost" onClick={() => openEdit(s)}>
                          Editar
                        </button>
                        <button className="btn btn-danger" onClick={() => void toggle(s)}>
                          {s.active ? 'Inativar' : 'Reativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <ModalForm
          title={editing ? 'Editar fornecedor' : 'Novo fornecedor'}
          onClose={() => setOpen(false)}
          onSubmit={save}
        >
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="sname">Nome *</label>
              <input
                id="sname"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sdoc">Documento</label>
              <input
                id="sdoc"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sphone">Telefone</label>
              <input
                id="sphone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="semail">E-mail</label>
              <input
                id="semail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="snotes">Observações</label>
              <textarea
                id="snotes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
