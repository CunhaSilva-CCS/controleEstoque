import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from '../components/ModalForm'
import { api, unwrap } from '../lib/api'
import { formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Product, Recipe } from '@shared/types'

type RecipeLine = { productId: string; quantity: string }

export function RecipesPage() {
  const { push } = useToast()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [finished, setFinished] = useState<Product[]>([])
  const [insumos, setInsumos] = useState<Product[]>([])
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<RecipeLine[]>([{ productId: '', quantity: '1' }])

  const load = useCallback(async () => {
    try {
      const [rlist, prods] = await Promise.all([
        unwrap(api.listRecipes()),
        unwrap(api.listProducts({ active: true })),
      ])
      setRecipes(rlist)
      setFinished(prods.filter((p) => p.kind === 'acabado'))
      setInsumos(prods.filter((p) => p.kind === 'insumo'))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar receitas', 'err')
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  function openEdit(recipe?: Recipe) {
    const pid = recipe?.productId ?? finished[0]?.id ?? ''
    setProductId(pid)
    setNotes(recipe?.notes ?? '')
    setLines(
      recipe?.items.length
        ? recipe.items.map((item) => ({ productId: item.productId, quantity: String(item.quantity) }))
        : [{ productId: insumos[0]?.id ?? '', quantity: '1' }],
    )
    setOpen(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await unwrap(
        api.saveRecipe({
          productId,
          notes,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity) || 0,
          })),
        }),
      )
      push('Receita salva')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao salvar receita', 'err')
    }
  }

  return (
    <div data-testid="recipes-page">
      <div className="page-header">
        <p>Composição de produtos acabados (insumos por unidade produzida)</p>
        <button
          className="btn btn-primary"
          data-testid="btn-new-recipe"
          onClick={() => openEdit()}
          disabled={finished.length === 0 || insumos.length === 0}
        >
          Nova receita
        </button>
      </div>

      <div className="panel panel-flush">
        {recipes.length === 0 ? (
          <div className="empty">Nenhuma receita cadastrada</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto acabado</th>
                  <th>Insumos</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td>
                      {recipe.productSku} · {recipe.productName}
                    </td>
                    <td>
                      {recipe.items.map((item) => (
                        <div key={item.id}>
                          {item.productSku} · {formatNumber(item.quantity)} {item.productName}
                        </div>
                      ))}
                    </td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => openEdit(recipe)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <ModalForm title="Receita de fabricação" onClose={() => setOpen(false)} onSubmit={save}>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="recipe-product">Produto acabado *</label>
              <select
                id="recipe-product"
                data-testid="select-recipe-product"
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {finished.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="recipe-notes">Observações</label>
              <textarea id="recipe-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="stack" style={{ marginTop: '1rem' }}>
            <strong>Insumos por unidade</strong>
            {lines.map((line, idx) => (
              <div key={idx} className="form-grid">
                <div className="field">
                  <label>Insumo *</label>
                  <select
                    required
                    value={line.productId}
                    onChange={(e) => {
                      const next = [...lines]
                      next[idx] = { ...next[idx], productId: e.target.value }
                      setLines(next)
                    }}
                  >
                    {insumos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Quantidade *</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...lines]
                      next[idx] = { ...next[idx], quantity: e.target.value }
                      setLines(next)
                    }}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setLines([...lines, { productId: insumos[0]?.id ?? '', quantity: '1' }])}
            >
              Adicionar insumo
            </button>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
