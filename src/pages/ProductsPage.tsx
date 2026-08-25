import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ModalForm } from '../components/ModalForm'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { StatusBadge } from '../components/StatusBadge'
import { api, unwrap } from '../lib/api'
import { formatCurrency, formatNumber, productKindLabel } from '../lib/format'
import { CUSTOM_UNIT_VALUE, isKnownUnit, PRODUCT_UNITS } from '../lib/units'
import { useToast } from '../lib/toast'
import type { Category, Product, ProductKind, Supplier } from '@shared/types'
import { roundQuantity } from '@shared/quantity'

type ProductForm = {
  sku: string
  name: string
  description: string
  categoryId: string
  supplierId: string
  kind: ProductKind
  unit: string
  costPrice: string
  salePrice: string
  minStock: string
}

type ProductRecipeLine = {
  productId: string
  quantity: string
}

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  supplierId: '',
  kind: 'insumo',
  unit: 'un',
  costPrice: '0',
  salePrice: '0',
  minStock: '0',
}

type SupplierQuickForm = {
  name: string
  document: string
  phone: string
  email: string
  notes: string
}

const emptySupplierQuickForm: SupplierQuickForm = {
  name: '',
  document: '',
  phone: '',
  email: '',
  notes: '',
}

export function ProductsPage() {
  const { push } = useToast()
  const [params, setParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [recipeInputs, setRecipeInputs] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1')
  const [showInactive, setShowInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [recipeNotes, setRecipeNotes] = useState('')
  const [recipeLines, setRecipeLines] = useState<ProductRecipeLine[]>([])
  const [auxiliary, setAuxiliary] = useState<'category' | 'supplier' | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')
  const [newSupplier, setNewSupplier] = useState<SupplierQuickForm>(emptySupplierQuickForm)

  const load = useCallback(async () => {
    try {
      const [plist, clist, slist, activeProducts] = await Promise.all([
        unwrap(api.listProducts({
          search,
          categoryId: categoryId || undefined,
          active: showInactive ? undefined : true,
          lowStockOnly: lowOnly || undefined,
        })),
        unwrap(api.listCategories(true)),
        unwrap(api.listSuppliers(true)),
        unwrap(api.listProducts({ active: true })),
      ])
      setProducts(plist)
      setCategories(clist)
      setSuppliers(slist)
      setRecipeInputs(activeProducts.filter((product) => product.kind === 'insumo'))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível carregar os produtos', 'err')
    }
  }, [search, categoryId, lowOnly, showInactive, push])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (lowOnly) setParams({ low: '1' })
    else setParams({})
  }, [lowOnly, setParams])

  const title = useMemo(
    () => (editing ? 'Editar produto' : 'Novo produto'),
    [editing],
  )

  const calculatedRecipeCost = useMemo(() => {
    const total = recipeLines.reduce((sum, line) => {
      const input = recipeInputs.find((product) => product.id === line.productId)
      return sum + (Number(line.quantity) || 0) * (input?.costPrice ?? 0)
    }, 0)
    return roundQuantity(total)
  }, [recipeInputs, recipeLines])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setRecipeNotes('')
    setRecipeLines([])
    setOpen(true)
  }

  async function openEdit(p: Product) {
    setEditing(p)
    setForm({
      sku: p.sku,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId ?? '',
      supplierId: p.supplierId ?? '',
      kind: p.kind,
      unit: p.unit,
      costPrice: String(p.costPrice),
      salePrice: String(p.salePrice),
      minStock: String(p.minStock),
    })
    setRecipeNotes('')
    setRecipeLines([])
    setOpen(true)
    if (p.kind === 'acabado') {
      try {
        const recipe = await unwrap(api.getRecipe(p.id))
        setRecipeNotes(recipe?.notes ?? '')
        setRecipeLines(
          recipe?.items.map((item) => ({
            productId: item.productId,
            quantity: String(item.quantity),
          })) ?? [],
        )
      } catch (err) {
        push(err instanceof Error ? err.message : 'Não foi possível carregar a composição do produto', 'err')
      }
    }
  }

  async function copyProduct(id: string) {
    const product = products.find((item) => item.id === id)
    if (!product) return
    setEditing(null)
    setForm({
      sku: product.sku,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId ?? '',
      supplierId: product.supplierId ?? '',
      kind: product.kind,
      unit: product.unit,
      costPrice: String(product.costPrice),
      salePrice: String(product.salePrice),
      minStock: String(product.minStock),
    })
    setRecipeNotes('')
    setRecipeLines([])
    if (product.kind === 'acabado') {
      try {
        const recipe = await unwrap(api.getRecipe(product.id))
        setRecipeNotes(recipe?.notes ?? '')
        setRecipeLines(recipe?.items.map((item) => ({
          productId: item.productId,
          quantity: String(item.quantity),
        })) ?? [])
      } catch (err) {
        push(err instanceof Error ? err.message : 'Não foi possível copiar a composição do produto', 'err')
      }
    }
  }

  async function saveProduct(e: FormEvent) {
    e.preventDefault()
    try {
      const normalizedSku = form.sku.trim().toLocaleLowerCase('pt-PT')
      const registeredProducts = await unwrap(api.listProducts({}))
      if (registeredProducts.some((product) => product.id !== editing?.id && product.sku.trim().toLocaleLowerCase('pt-PT') === normalizedSku)) {
        throw new Error('Já existe um produto com este código')
      }
      const wasEditing = Boolean(editing)
      const payload = {
        sku: form.sku,
        name: form.name,
        description: form.description,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        kind: form.kind,
        unit: form.unit,
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        minStock: Number(form.minStock),
      }
      if (form.kind === 'acabado') {
        if (recipeLines.length === 0) throw new Error('Adicione, pelo menos, uma matéria-prima ao produto final')
        if (recipeLines.some((line) => !line.productId || !(Number(line.quantity) > 0))) {
          throw new Error('Indique a matéria-prima e uma quantidade superior a zero')
        }
        if (new Set(recipeLines.map((line) => line.productId)).size !== recipeLines.length) {
          throw new Error('Não repita a mesma matéria-prima na composição')
        }
      }
      let savedProduct: Product
      if (editing) {
        savedProduct = await unwrap(api.updateProduct({ id: editing.id, ...payload }))
      } else {
        savedProduct = await unwrap(api.createProduct(payload))
        setEditing(savedProduct)
      }
      if (form.kind === 'acabado') {
        await unwrap(api.saveRecipe({
          productId: savedProduct.id,
          notes: recipeNotes,
          items: recipeLines.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
          })),
        }))
      }
      push(
        form.kind === 'acabado'
          ? wasEditing
            ? 'Produto final e composição atualizados'
            : 'Produto final e composição registados'
          : wasEditing
            ? 'Produto atualizado'
            : 'Produto registado',
      )
      setOpen(false)
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível guardar o produto', 'err')
    }
  }

  async function toggleActive(p: Product) {
    try {
      await unwrap(api.setProductActive(p.id, !p.active))
      push(p.active ? 'Produto inativado' : 'Produto reativado')
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível alterar a situação do produto', 'err')
    }
  }

  function openCategoryQuickCreate() {
    setNewCategoryName('')
    setNewCategoryDescription('')
    setAuxiliary('category')
  }

  function openSupplierQuickCreate() {
    setNewSupplier(emptySupplierQuickForm)
    setAuxiliary('supplier')
  }

  async function saveCategoryQuick(e: FormEvent) {
    e.preventDefault()
    try {
      const created = await unwrap(api.createCategory({
        name: newCategoryName,
        description: newCategoryDescription,
      }))
      setCategories(await unwrap(api.listCategories(true)))
      setForm((current) => ({ ...current, categoryId: created.id }))
      setAuxiliary(null)
      push('Categoria registada e selecionada com sucesso')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível registar a categoria', 'err')
    }
  }

  async function saveSupplierQuick(e: FormEvent) {
    e.preventDefault()
    try {
      const created = await unwrap(api.createSupplier(newSupplier))
      setSuppliers(await unwrap(api.listSuppliers(true)))
      setForm((current) => ({ ...current, supplierId: created.id }))
      setAuxiliary(null)
      push('Fornecedor registado e selecionado com sucesso')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível registar o fornecedor', 'err')
    }
  }

  const productGroups = [
    { key: 'insumo', label: 'Matérias-primas', items: products.filter((product) => product.kind === 'insumo') },
    { key: 'acabado', label: 'Produtos finais', items: products.filter((product) => product.kind === 'acabado') },
  ]

  return (
    <div className="collection-page products-page" data-testid="products-page">
      <CollectionPageHeader
        icon="▦"
        description="Faça a gestão das matérias-primas e dos produtos finais, com saldos atualizados pelas compras e fabricações."
        count={products.length}
        singular="produto encontrado"
        plural="produtos encontrados"
      >
        <button className="btn btn-primary" data-testid="btn-new-product" onClick={openCreate}>
          <span aria-hidden>+</span>
          Novo produto
        </button>
      </CollectionPageHeader>

      <div className="toolbar collection-toolbar products-toolbar">
        <div className="field-inline filter-grow">
          <label htmlFor="search">Buscar</label>
          <input
            id="search"
            placeholder="Nome ou código"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field-inline">
          <label htmlFor="cat">Categoria</label>
          <select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="check-chip">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          Apenas stock baixo
        </label>
        <label className="check-chip">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Incluir inativos
        </label>
      </div>

      <div className="panel panel-flush">
        {products.length === 0 ? (
          <CollectionEmpty icon="▦" title="Ainda não há produtos nesta lista" description="Cadastre um produto ou ajuste os filtros para encontrar o que procura." />
        ) : (
          <div className="table-wrap">
            <table className="collection-table products-table">
              <thead>
                <tr>
                  <th>Código do<br />produto</th>
                  <th>Nome do<br />produto</th>
                  <th>Tipo de<br />produto</th>
                  <th>Categoria</th>
                  <th>Unidade</th>
                  <th className="numeric-column">Stock atual</th>
                  <th className="numeric-column">Stock mínimo</th>
                  <th className="money-column">Preço de venda<br />unitário</th>
                  <th className="money-column">Custo total<br />em stock</th>
                  <th>Estado do<br />stock</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {productGroups.map((group) => group.items.length > 0 ? (
                  <Fragment key={group.key}>
                    <tr className={`products-group-row products-group-${group.key}`}>
                      <td colSpan={11}>
                        <strong>{group.label}</strong>
                        <span>{group.items.length} {group.items.length === 1 ? 'produto' : 'produtos'}</span>
                      </td>
                    </tr>
                    {group.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>
                      {p.name}
                      {!p.active ? <span className="muted"> · inativo</span> : null}
                    </td>
                    <td>{productKindLabel(p.kind)}</td>
                    <td>{p.categoryName ?? '—'}</td>
                    <td className="unit-column">{p.unit}</td>
                    <td className="numeric-column">
                      {formatNumber(p.stock)} {p.unit}
                    </td>
                    <td className="numeric-column">{formatNumber(p.minStock)} {p.unit}</td>
                    <td className="money-column"><strong>{formatCurrency(p.salePrice)}</strong></td>
                    <td className="money-column">{formatCurrency(p.stockValue ?? 0)}</td>
                    <td className="status-column">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="actions-column">
                      <div className="row-actions">
                        <button className="btn btn-ghost" onClick={() => void openEdit(p)}>
                          Editar
                        </button>
                        <button className="btn btn-danger" onClick={() => void toggleActive(p)}>
                          {p.active ? 'Inativar' : 'Reativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                    ))}
                  </Fragment>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && !auxiliary ? (
        <ModalForm
          title={title}
          hint={
            editing
              ? 'A edição cadastral não altera o saldo.'
              : 'As matérias-primas entram no stock por fatura. Os produtos finais entram pela fabricação.'
          }
          onClose={() => setOpen(false)}
          onSubmit={saveProduct}
          copyOptions={!editing ? products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` })) : undefined}
          onCopy={!editing ? (id) => void copyProduct(id) : undefined}
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sku">Código *</label>
              <input
                id="sku" data-testid="input-product-sku"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="unit">Unidade *</label>
              <select
                id="unit"
                data-testid="select-product-unit"
                required
                value={isKnownUnit(form.unit) ? form.unit : CUSTOM_UNIT_VALUE}
                onChange={(e) => {
                  const next = e.target.value
                  if (next === CUSTOM_UNIT_VALUE) {
                    setForm({ ...form, unit: isKnownUnit(form.unit) ? '' : form.unit })
                    return
                  }
                  setForm({ ...form, unit: next })
                }}
              >
                {PRODUCT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
                <option value={CUSTOM_UNIT_VALUE}>Outra (informar sigla)</option>
              </select>
              {!isKnownUnit(form.unit) ? (
                <input
                  data-testid="input-product-unit"
                  required
                  placeholder="Ex.: ton, bd, fardo"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="unit-custom-input"
                />
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="kind">Tipo *</label>
              <select
                id="kind"
                data-testid="select-product-kind"
                required
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as ProductKind
                  setForm({ ...form, kind })
                  if (kind === 'acabado' && recipeLines.length === 0 && recipeInputs[0]) {
                    setRecipeLines([{ productId: recipeInputs[0].id, quantity: '1' }])
                  }
                }}
              >
                <option value="insumo">Matéria-prima</option>
                <option value="acabado">Produto final</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="name">Nome *</label>
              <input
                id="name" data-testid="input-product-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="desc">Descrição do produto</label>
              <textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="field">
              <div className="field-label-actions">
                <label htmlFor="pcat">Categoria</label>
                <button
                  type="button"
                  className="field-link"
                  data-testid="btn-product-new-category"
                  onClick={openCategoryQuickCreate}
                >
                  Registar categoria
                </button>
              </div>
              <select
                id="pcat"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="field-label-actions">
                <label htmlFor="psup">Fornecedor</label>
                <button
                  type="button"
                  className="field-link"
                  data-testid="btn-product-new-supplier"
                  onClick={openSupplierQuickCreate}
                >
                  Registar fornecedor
                </button>
              </div>
              <select
                id="psup"
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cost">{form.kind === 'insumo' ? 'Custo médio (automático)' : 'Custo de fabricação (automático)'}</label>
              <input
                id="cost" data-testid="input-product-cost"
                type="number"
                min="0"
                step="0.000001"
                required
                disabled
                value={form.kind === 'acabado' ? calculatedRecipeCost : form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
              />
              <small>{form.kind === 'insumo' ? 'Calculado pela média ponderada das faturas de compra.' : `Soma proporcional das matérias-primas: ${formatCurrency(calculatedRecipeCost)}.`}</small>
            </div>
            <div className="field">
              <label htmlFor="sale">Preço de venda</label>
              <input
                id="sale" data-testid="input-product-sale"
                type="number"
                min="0"
                step="0.000001"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="min">Stock mínimo *</label>
              <input
                id="min" data-testid="input-product-min"
                type="number"
                min="0"
                step="0.000001"
                required
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </div>
            {form.kind === 'acabado' ? (
              <div className="field full product-recipe-editor" data-testid="product-recipe-editor">
                <div className="product-recipe-heading">
                  <div>
                    <strong>Composição para fabricação</strong>
                    <span>Quantidades de matéria-prima consumidas para produzir 1 unidade.</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    data-testid="btn-product-add-input"
                    disabled={recipeInputs.length === 0}
                    onClick={() => setRecipeLines([
                      ...recipeLines,
                      { productId: recipeInputs[0]?.id ?? '', quantity: '1' },
                    ])}
                  >
                    + Adicionar matéria-prima
                  </button>
                </div>
                {recipeInputs.length === 0 ? (
                  <div className="alert alert-error">
                    Registe, pelo menos, um produto do tipo Matéria-prima antes de criar um produto final.
                  </div>
                ) : null}
                <div className="product-recipe-lines">
                  {recipeLines.map((line, index) => (
                    <div className="product-recipe-line" key={`${line.productId}-${index}`}>
                      <div className="field">
                        <label htmlFor={`product-recipe-input-${index}`}>Matéria-prima {index + 1} *</label>
                        <select
                          id={`product-recipe-input-${index}`}
                          data-testid={index === 0 ? 'select-product-recipe-input' : undefined}
                          required
                          value={line.productId}
                          onChange={(e) => {
                            const next = [...recipeLines]
                            next[index] = { ...line, productId: e.target.value }
                            setRecipeLines(next)
                          }}
                        >
                          <option value="">Selecione</option>
                          {recipeInputs.map((input) => (
                            <option key={input.id} value={input.id}>{input.sku} · {input.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field product-recipe-quantity">
                        <label htmlFor={`product-recipe-quantity-${index}`}>Qtd. por unidade *</label>
                        <input
                          id={`product-recipe-quantity-${index}`}
                          data-testid={index === 0 ? 'input-product-recipe-qty' : undefined}
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          required
                          value={line.quantity}
                          onChange={(e) => {
                            const next = [...recipeLines]
                            next[index] = { ...line, quantity: e.target.value }
                            setRecipeLines(next)
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="field-link field-link-danger product-recipe-remove"
                        onClick={() => setRecipeLines(recipeLines.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="product-recipe-notes">Observações da composição</label>
                  <textarea
                    id="product-recipe-notes"
                    value={recipeNotes}
                    onChange={(e) => setRecipeNotes(e.target.value)}
                    placeholder="Ex.: perdas previstas, orientações de produção ou outras observações"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </ModalForm>
      ) : null}

      {auxiliary === 'category' ? (
        <ModalForm
          title="Nova categoria"
          hint="Depois de guardar, regressará ao produto com esta categoria selecionada."
          onClose={() => setAuxiliary(null)}
          onSubmit={saveCategoryQuick}
        >
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="product-quick-category-name">Nome *</label>
              <input
                id="product-quick-category-name"
                data-testid="input-product-quick-category-name"
                required
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="product-quick-category-description">Descrição</label>
              <textarea
                id="product-quick-category-description"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}

      {auxiliary === 'supplier' ? (
        <ModalForm
          title="Novo fornecedor"
          hint="Depois de guardar, regressará ao produto com este fornecedor selecionado."
          onClose={() => setAuxiliary(null)}
          onSubmit={saveSupplierQuick}
        >
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="product-quick-supplier-name">Nome *</label>
              <input
                id="product-quick-supplier-name"
                data-testid="input-product-quick-supplier-name"
                required
                value={newSupplier.name}
                onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="product-quick-supplier-document">Documento</label>
              <input
                id="product-quick-supplier-document"
                value={newSupplier.document}
                onChange={(e) => setNewSupplier({ ...newSupplier, document: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="product-quick-supplier-phone">Telefone</label>
              <input
                id="product-quick-supplier-phone"
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="product-quick-supplier-email">E-mail</label>
              <input
                id="product-quick-supplier-email"
                type="email"
                value={newSupplier.email}
                onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="product-quick-supplier-notes">Observações</label>
              <textarea
                id="product-quick-supplier-notes"
                value={newSupplier.notes}
                onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
              />
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  )
}
