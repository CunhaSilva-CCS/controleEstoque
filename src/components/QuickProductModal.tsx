import { useEffect, useState, type FormEvent } from 'react'
import { ModalForm } from './ModalForm'
import { api, unwrap } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Category, Product, ProductType, Supplier } from '@shared/types'
import { PRODUCT_TYPES } from '@shared/product-types'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (product: Product) => void
  defaultSupplierId?: string
  defaultProductType?: ProductType
  /** When true, product starts with zero stock (e.g. stock will come from invoice). */
  zeroInitialStock?: boolean
}

export function QuickProductModal({
  open,
  onClose,
  onCreated,
  defaultSupplierId = '',
  defaultProductType = 'revenda',
  zeroInitialStock = false,
}: Props) {
  const { push } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('un')
  const [productType, setProductType] = useState<ProductType>(defaultProductType)
  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState(defaultSupplierId)
  const [costPrice, setCostPrice] = useState('0')
  const [salePrice, setSalePrice] = useState('0')
  const [minStock, setMinStock] = useState('0')

  useEffect(() => {
    if (!open) return
    setSupplierId(defaultSupplierId)
    setProductType(defaultProductType)
    void (async () => {
      try {
        const [cats, sups] = await Promise.all([
          unwrap(api.listCategories(true)),
          unwrap(api.listSuppliers(true)),
        ])
        setCategories(cats)
        setSuppliers(sups)
      } catch (err) {
        push(err instanceof Error ? err.message : 'Erro ao carregar dados', 'err')
      }
    })()
  }, [open, defaultSupplierId, defaultProductType, push])

  if (!open) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      const product = await unwrap(
        api.createProduct({
          sku,
          name,
          unit,
          productType,
          categoryId: categoryId || null,
          supplierId: supplierId || null,
          costPrice: Number(costPrice) || 0,
          salePrice: Number(salePrice) || 0,
          minStock: Number(minStock) || 0,
          initialStock: zeroInitialStock ? 0 : undefined,
        }),
      )
      push('Produto cadastrado')
      onCreated(product)
      setSku('')
      setName('')
      setUnit('un')
      setProductType(defaultProductType)
      setCategoryId('')
      setCostPrice('0')
      setSalePrice('0')
      setMinStock('0')
      onClose()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao cadastrar produto', 'err')
    }
  }

  return (
    <ModalForm
      title="Novo produto"
      hint={
        zeroInitialStock
          ? 'Estoque inicial zero — a entrada virá da fatura ou fabricação'
          : 'SKU único. Estoque inicial pode ser definido depois.'
      }
      onClose={onClose}
      onSubmit={save}
      submitLabel="Cadastrar"
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="qpsku">SKU *</label>
          <input id="qpsku" required value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="qpunit">Unidade *</label>
          <input id="qpunit" required value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="field full">
          <label htmlFor="qpname">Nome *</label>
          <input id="qpname" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="qpptype">Tipo *</label>
          <select
            id="qpptype"
            required
            value={productType}
            onChange={(e) => setProductType(e.target.value as ProductType)}
          >
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="qpcat">Categoria</label>
          <select id="qpcat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="qpsup">Fornecedor</label>
          <select id="qpsup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="qpcost">Preço de custo *</label>
          <input
            id="qpcost"
            type="number"
            min="0"
            step="0.01"
            required
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="qpsale">Preço de venda</label>
          <input
            id="qpsale"
            type="number"
            min="0"
            step="0.01"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="qpmin">Estoque mínimo *</label>
          <input
            id="qpmin"
            type="number"
            min="0"
            step="0.001"
            required
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
        </div>
      </div>
    </ModalForm>
  )
}
