import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { api, unwrap } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Category } from '@shared/types'

export function CategoriesPage() {
  const { push } = useToast()
  const [items, setItems] = useState<Category[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const load = useCallback(async () => {
    try {
      setItems(await unwrap(api.listCategories()))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível carregar as categorias', 'err')
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setName('')
    setDescription('')
    setOpen(true)
  }

  function openEdit(c: Category) {
    setEditing(c)
    setName(c.name)
    setDescription(c.description)
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      if (editing) {
        await unwrap(
          api.updateCategory({
            id: editing.id,
            name,
            description,
            active: editing.active,
          }),
        )
        push('Categoria atualizada')
      } else {
        await unwrap(api.createCategory({ name, description }))
        push('Categoria registada')
      }
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível guardar a categoria', 'err')
    }
  }

  async function toggle(c: Category) {
    try {
      await unwrap(
        api.updateCategory({
          id: c.id,
          name: c.name,
          description: c.description,
          active: !c.active,
        }),
      )
      push(c.active ? 'Categoria inativada' : 'Categoria reativada')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível alterar a situação da categoria', 'err')
    }
  }

  return (
    <div className="collection-page categories-page" data-testid="categories-page">
      <CollectionPageHeader icon="□" description="Organize os produtos por grupos para facilitar as consultas e os registos." count={items.length} singular="categoria registada" plural="categorias registadas">
        <button className="btn btn-primary" data-testid="btn-new-category" onClick={openCreate}>
          <span aria-hidden>+</span>
          Nova categoria
        </button>
      </CollectionPageHeader>

      <div className="panel panel-flush">
        {items.length === 0 ? (
          <CollectionEmpty icon="□" title="Ainda não existem categorias registadas" description="Crie a primeira categoria para organizar os seus produtos." />
        ) : (
          <div className="table-wrap">
            <table className="collection-table categories-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Descrição</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.description || '—'}</td>
                    <td>
                      <span className={`badge ${c.active ? 'badge-ok' : 'badge-zero'}`}>
                        {c.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost" onClick={() => openEdit(c)}>
                          Editar
                        </button>
                        <button className="btn btn-danger" onClick={() => void toggle(c)}>
                          {c.active ? 'Inativar' : 'Reativar'}
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
          title={editing ? 'Editar categoria' : 'Nova categoria'}
          onClose={() => setOpen(false)}
          onSubmit={save}
        >
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="cname">Nome *</label>
              <input
                id="cname" data-testid="input-category-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="cdesc">Descrição</label>
              <textarea
                id="cdesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
