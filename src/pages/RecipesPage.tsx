import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { api, unwrap } from '../lib/api'
import { formatNumber } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Product, Recipe } from '@shared/types'

type RecipeLine = { productId: string; quantity: string }

export function RecipesPage() {
  const navigate = useNavigate()
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
      push(err instanceof Error ? err.message : 'Não foi possível carregar as receitas', 'err')
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
      push('Receita salva com sucesso')
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível guardar a receita', 'err')
    }
  }

  return (
    <div className="collection-page recipes-page" data-testid="recipes-page">
      <CollectionPageHeader icon="≡" description="Defina as matérias-primas e as quantidades necessárias para fabricar cada produto final." count={recipes.length} singular="receita registada" plural="receitas registadas">
        <button
          className="btn btn-primary"
          data-testid="btn-new-recipe"
          onClick={() => openEdit()}
          disabled={finished.length === 0 || insumos.length === 0}
        >
          <span aria-hidden>+</span>
          Nova receita
        </button>
      </CollectionPageHeader>

      <div className="panel panel-flush">
        {recipes.length === 0 ? (
          <CollectionEmpty icon="≡" title="Ainda não existem receitas registadas" description="Crie a primeira receita para disponibilizar o produto final para fabricação." />
        ) : (
          <div className="table-wrap">
            <table className="collection-table recipes-table">
              <thead>
                <tr>
                  <th>Produto final</th>
                  <th>Matérias-primas</th>
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
              <div className="field-label-actions">
                <label htmlFor="recipe-product">Produto final *</label>
                <button type="button" className="field-link" onClick={() => navigate('/produtos')}>Registar ou consultar produtos</button>
              </div>
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

          <div className="stack form-section">
            <strong>Matérias-primas por unidade</strong>
            {lines.map((line, idx) => (
              <div key={idx} className="line-item-card">
                <div className="line-item-header">
                  <strong>Matéria-prima {idx + 1}</strong>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      className="field-link field-link-danger"
                      onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== idx))}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                <div className="form-grid">
                <div className="field">
                  <div className="field-label-actions">
                    <label htmlFor={`recipe-component-${idx}`}>Matéria-prima *</label>
                    <button type="button" className="field-link" onClick={() => navigate('/produtos')}>Registar ou consultar produtos</button>
                  </div>
                  <select
                    id={`recipe-component-${idx}`}
                    data-testid={idx === 0 ? 'select-recipe-component' : undefined}
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
                  <label htmlFor={`recipe-qty-${idx}`}>Quantidade *</label>
                  <input
                    id={`recipe-qty-${idx}`}
                    data-testid={idx === 0 ? 'input-recipe-qty' : undefined}
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
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setLines([...lines, { productId: insumos[0]?.id ?? '', quantity: '1' }])}
            >
              Adicionar matéria-prima
            </button>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
