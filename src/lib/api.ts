import type {
  ApiResponse,
  Category,
  DashboardData,
  Invoice,
  InvoiceInput,
  InvoiceItem,
  ManufacturingInput,
  ManufacturingOrder,
  MovementFilters,
  MovementInput,
  Product,
  ProductFilters,
  ProductInput,
  ProductRecipeInput,
  ProductRecipeItem,
  ProductStatus,
  ProductUpdateInput,
  ReportType,
  StockMovement,
  Supplier,
} from '@shared/types'
import {
  FINISHED_PRODUCT_TYPES,
  isProductType,
  MATERIAL_PRODUCT_TYPES,
  productTypeLabel,
  type ProductType,
} from '@shared/product-types'

function computeStatus(stock: number, minStock: number): ProductStatus {
  if (stock <= 0) return 'zero'
  if (stock <= minStock) return 'low'
  return 'ok'
}

function uid(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

/** In-memory fallback when running outside Electron (browser preview / tests). */
function createMemoryApi() {
  const categories: Category[] = []
  const suppliers: Supplier[] = []
  const products: Product[] = []
  const movements: StockMovement[] = []
  const invoices: Invoice[] = []
  const invoiceItems: InvoiceItem[] = []
  const recipes: ProductRecipeItem[] = []
  const manufacturingOrders: ManufacturingOrder[] = []
  let seeded = false

  function enrich(p: Product): Product {
    return {
      ...p,
      categoryName: categories.find((c) => c.id === p.categoryId)?.name ?? null,
      supplierName: suppliers.find((s) => s.id === p.supplierId)?.name ?? null,
      status: computeStatus(p.stock, p.minStock),
      stockValue: p.stock * p.costPrice,
    }
  }

  function ok<T>(data: T): ApiResponse<T> {
    return { ok: true, data }
  }

  function fail(error: string): ApiResponse<never> {
    return { ok: false, error }
  }

  function registerMovementInternal(input: MovementInput, ts: string = now()): StockMovement {
    const p = products.find((x) => x.id === input.productId)
    if (!p) throw new Error('Produto não encontrado')
    if (!p.active) throw new Error('Produto inativo não pode receber movimentações')
    if (!input.reason.trim()) throw new Error('Motivo é obrigatório')

    const previous = p.stock
    let quantity = input.quantity
    let newStock: number

    if (input.type === 'entrada') {
      if (!(quantity > 0)) throw new Error('Quantidade da entrada deve ser maior que zero')
      newStock = previous + quantity
    } else if (input.type === 'saida') {
      if (!(quantity > 0)) throw new Error('Quantidade da saída deve ser maior que zero')
      if (quantity > previous) throw new Error(`Saldo insuficiente. Disponível: ${previous}`)
      newStock = previous - quantity
    } else {
      if (input.newStock === undefined || input.newStock < 0) {
        throw new Error('Informe o novo saldo (≥ 0) para o ajuste')
      }
      newStock = input.newStock
      quantity = newStock - previous
    }

    p.stock = newStock
    p.updatedAt = ts
    const m: StockMovement = {
      id: uid(),
      productId: p.id,
      type: input.type,
      quantity,
      previousStock: previous,
      newStock,
      reason: input.reason.trim(),
      reference: input.reference?.trim() ?? '',
      createdAt: ts,
      productName: p.name,
      productSku: p.sku,
    }
    movements.unshift(m)
    return m
  }

  function getInvoiceById(id: string): Invoice | null {
    const invoice = invoices.find((i) => i.id === id)
    if (!invoice) return null
    const items = invoiceItems.filter((ii) => ii.invoiceId === id)
    return {
      ...invoice,
      items,
      itemCount: items.length,
      totalValue: items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
    }
  }

  return {
    async init() {
      return ok({ path: ':memory:', seeded })
    },
    async seed(accept: boolean) {
      seeded = true
      if (!accept) return ok(true)
      const ts = now()
      const catGeral = uid()
      const catEletronicos = uid()
      const catEscritorio = uid()
      categories.push(
        {
          id: catGeral,
          name: 'Geral',
          description: 'Categoria padrão',
          active: true,
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: catEletronicos,
          name: 'Eletrônicos',
          description: 'Equipamentos e acessórios',
          active: true,
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: catEscritorio,
          name: 'Escritório',
          description: 'Material de escritório',
          active: true,
          createdAt: ts,
          updatedAt: ts,
        },
      )
      const sup1 = uid()
      const sup2 = uid()
      suppliers.push(
        {
          id: sup1,
          name: 'Distribuidora Norte',
          document: '12.345.678/0001-90',
          phone: '(11) 3000-1000',
          email: 'contato@norte.com',
          notes: '',
          active: true,
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: sup2,
          name: 'Papelaria Central',
          document: '98.765.432/0001-10',
          phone: '(11) 4000-2000',
          email: 'vendas@papelaria.com',
          notes: '',
          active: true,
          createdAt: ts,
          updatedAt: ts,
        },
      )
      const demo = [
        {
          sku: 'CAB-USB-C',
          name: 'Cabo USB-C 1m',
          productType: 'revenda' as ProductType,
          categoryId: catEletronicos,
          supplierId: sup1,
          unit: 'un',
          costPrice: 8.5,
          salePrice: 19.9,
          minStock: 10,
          stock: 45,
        },
        {
          sku: 'MOUSE-OP',
          name: 'Mouse óptico USB',
          productType: 'revenda' as ProductType,
          categoryId: catEletronicos,
          supplierId: sup1,
          unit: 'un',
          costPrice: 22,
          salePrice: 49.9,
          minStock: 5,
          stock: 3,
        },
        {
          sku: 'CANETA-AZ',
          name: 'Caneta esferográfica azul',
          productType: 'revenda' as ProductType,
          categoryId: catEscritorio,
          supplierId: sup2,
          unit: 'cx',
          costPrice: 12,
          salePrice: 24,
          minStock: 8,
          stock: 20,
        },
        {
          sku: 'RESMA-A4',
          name: 'Resma papel A4 500 folhas',
          productType: 'materia_prima' as ProductType,
          categoryId: catEscritorio,
          supplierId: sup2,
          unit: 'un',
          costPrice: 18,
          salePrice: 32,
          minStock: 15,
          stock: 0,
        },
        {
          sku: 'FITA-DUP',
          name: 'Fita adesiva dupla face',
          productType: 'insumo' as ProductType,
          categoryId: catGeral,
          supplierId: null as string | null,
          unit: 'un',
          costPrice: 4.5,
          salePrice: 9.9,
          minStock: 12,
          stock: 12,
        },
      ]
      for (const item of demo) {
        const id = uid()
        const product = enrich({
          id,
          description: '',
          active: true,
          createdAt: ts,
          updatedAt: ts,
          ...item,
        })
        products.push(product)
        if (item.stock > 0) {
          movements.push({
            id: uid(),
            productId: id,
            type: 'entrada',
            quantity: item.stock,
            previousStock: 0,
            newStock: item.stock,
            reason: 'Estoque inicial',
            reference: 'SEED',
            createdAt: ts,
            productName: item.name,
            productSku: item.sku,
          })
        }
      }
      return ok(true)
    },
    async listCategories(activeOnly?: boolean) {
      return ok(activeOnly ? categories.filter((c) => c.active) : [...categories])
    },
    async createCategory(input: { name: string; description?: string }) {
      if (!input.name.trim()) return fail('Nome da categoria é obrigatório')
      if (categories.some((c) => c.name.toLowerCase() === input.name.trim().toLowerCase())) {
        return fail('Já existe uma categoria com este nome')
      }
      const ts = now()
      const cat: Category = {
        id: uid(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        active: true,
        createdAt: ts,
        updatedAt: ts,
      }
      categories.push(cat)
      return ok(cat)
    },
    async updateCategory(input: {
      id: string
      name: string
      description?: string
      active: boolean
    }) {
      const cat = categories.find((c) => c.id === input.id)
      if (!cat) return fail('Categoria não encontrada')
      if (!input.active && products.some((p) => p.categoryId === input.id && p.active)) {
        return fail('Não é possível inativar: há produto(s) ativo(s) nesta categoria')
      }
      cat.name = input.name.trim()
      cat.description = input.description?.trim() ?? ''
      cat.active = input.active
      cat.updatedAt = now()
      return ok(cat)
    },
    async listSuppliers(activeOnly?: boolean) {
      return ok(activeOnly ? suppliers.filter((s) => s.active) : [...suppliers])
    },
    async createSupplier(input: {
      name: string
      document?: string
      phone?: string
      email?: string
      notes?: string
    }) {
      if (!input.name.trim()) return fail('Nome do fornecedor é obrigatório')
      const ts = now()
      const s: Supplier = {
        id: uid(),
        name: input.name.trim(),
        document: input.document?.trim() ?? '',
        phone: input.phone?.trim() ?? '',
        email: input.email?.trim() ?? '',
        notes: input.notes?.trim() ?? '',
        active: true,
        createdAt: ts,
        updatedAt: ts,
      }
      suppliers.push(s)
      return ok(s)
    },
    async updateSupplier(input: {
      id: string
      name: string
      document?: string
      phone?: string
      email?: string
      notes?: string
      active: boolean
    }) {
      const s = suppliers.find((x) => x.id === input.id)
      if (!s) return fail('Fornecedor não encontrado')
      Object.assign(s, {
        name: input.name.trim(),
        document: input.document?.trim() ?? '',
        phone: input.phone?.trim() ?? '',
        email: input.email?.trim() ?? '',
        notes: input.notes?.trim() ?? '',
        active: input.active,
        updatedAt: now(),
      })
      return ok(s)
    },
    async listProducts(filters: ProductFilters = {}) {
      let list = products.map(enrich)
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase()
        list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      }
      if (filters.categoryId) list = list.filter((p) => p.categoryId === filters.categoryId)
      if (filters.active !== undefined) list = list.filter((p) => p.active === filters.active)
      if (filters.lowStockOnly) list = list.filter((p) => p.stock <= p.minStock)
      if (filters.productType) list = list.filter((p) => p.productType === filters.productType)
      return ok(list.sort((a, b) => a.name.localeCompare(b.name)))
    },
    async getProduct(id: string) {
      const p = products.find((x) => x.id === id)
      return ok(p ? enrich(p) : null)
    },
    async createProduct(input: ProductInput) {
      if (!input.sku.trim()) return fail('SKU é obrigatório')
      if (!input.name.trim()) return fail('Nome do produto é obrigatório')
      if (products.some((p) => p.sku.toLowerCase() === input.sku.trim().toLowerCase())) {
        return fail('Já existe um produto com este SKU')
      }
      if (!isProductType(input.productType)) return fail('Tipo de produto inválido')
      const initial = input.initialStock ?? 0
      const ts = now()
      const p: Product = enrich({
        id: uid(),
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        productType: input.productType,
        categoryId: input.categoryId || null,
        supplierId: input.supplierId || null,
        unit: input.unit.trim(),
        costPrice: input.costPrice,
        salePrice: input.salePrice,
        minStock: input.minStock,
        stock: initial,
        active: true,
        createdAt: ts,
        updatedAt: ts,
      })
      products.push(p)
      if (initial > 0) {
        movements.unshift({
          id: uid(),
          productId: p.id,
          type: 'entrada',
          quantity: initial,
          previousStock: 0,
          newStock: initial,
          reason: 'Estoque inicial',
          reference: '',
          createdAt: ts,
          productName: p.name,
          productSku: p.sku,
        })
      }
      return ok(enrich(p))
    },
    async updateProduct(input: ProductUpdateInput) {
      const p = products.find((x) => x.id === input.id)
      if (!p) return fail('Produto não encontrado')
      if (
        products.some(
          (x) => x.id !== input.id && x.sku.toLowerCase() === input.sku.trim().toLowerCase(),
        )
      ) {
        return fail('Já existe um produto com este SKU')
      }
      if (!isProductType(input.productType)) return fail('Tipo de produto inválido')
      Object.assign(p, {
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        productType: input.productType,
        categoryId: input.categoryId || null,
        supplierId: input.supplierId || null,
        unit: input.unit.trim(),
        costPrice: input.costPrice,
        salePrice: input.salePrice,
        minStock: input.minStock,
        updatedAt: now(),
      })
      return ok(enrich(p))
    },
    async setProductActive(id: string, active: boolean) {
      const p = products.find((x) => x.id === id)
      if (!p) return fail('Produto não encontrado')
      p.active = active
      p.updatedAt = now()
      return ok(enrich(p))
    },
    async listMovements(filters: MovementFilters = {}) {
      let list = [...movements]
      if (filters.productId) list = list.filter((m) => m.productId === filters.productId)
      if (filters.type) list = list.filter((m) => m.type === filters.type)
      if (filters.from) list = list.filter((m) => m.createdAt >= filters.from!)
      if (filters.to) list = list.filter((m) => m.createdAt <= filters.to!)
      return ok(list)
    },
    async createMovement(input: MovementInput) {
      try {
        return ok(registerMovementInternal(input))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    },
    async getDashboard(): Promise<ApiResponse<DashboardData>> {
      const active = products.filter((p) => p.active).map(enrich)
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      return ok({
        activeProducts: active.length,
        totalStockValue: active.reduce((s, p) => s + (p.stockValue ?? 0), 0),
        lowStockCount: active.filter((p) => p.stock > 0 && p.stock <= p.minStock).length,
        zeroStockCount: active.filter((p) => p.stock <= 0).length,
        movementsToday: movements.filter((m) => m.createdAt >= start.toISOString()).length,
        criticalProducts: active
          .filter((p) => p.stock <= p.minStock)
          .sort((a, b) => a.stock - b.stock)
          .slice(0, 5),
        recentMovements: movements.slice(0, 8),
      })
    },
    async getReport(type: ReportType, filters?: MovementFilters): Promise<
      ApiResponse<{ columns: string[]; rows: Record<string, string | number | boolean | null>[] }>
    > {
      if (type === 'posicao') {
        const res = await this.listProducts({ active: true })
        const list = res.ok ? res.data : []
        return ok({
          columns: ['SKU', 'Nome', 'Tipo', 'Categoria', 'Saldo', 'Unidade', 'Custo', 'Valor', 'Status'],
          rows: list.map((p) => ({
            SKU: p.sku,
            Nome: p.name,
            Tipo: productTypeLabel(p.productType),
            Categoria: p.categoryName ?? '',
            Saldo: p.stock,
            Unidade: p.unit,
            Custo: p.costPrice,
            Valor: p.stockValue ?? 0,
            Status: p.status ?? 'ok',
          })),
        })
      }
      if (type === 'baixo') {
        const res = await this.listProducts({ active: true, lowStockOnly: true })
        const list = res.ok ? res.data : []
        return ok({
          columns: ['SKU', 'Nome', 'Saldo', 'Mínimo', 'Diferença', 'Status'],
          rows: list.map((p) => ({
            SKU: p.sku,
            Nome: p.name,
            Saldo: p.stock,
            Mínimo: p.minStock,
            Diferença: p.stock - p.minStock,
            Status: p.status ?? 'low',
          })),
        })
      }
      const res = await this.listMovements(filters)
      const list = res.ok ? res.data : []
      return ok({
        columns: [
          'Data',
          'SKU',
          'Produto',
          'Tipo',
          'Quantidade',
          'Saldo anterior',
          'Saldo novo',
          'Motivo',
        ],
        rows: list.map((m) => ({
          Data: m.createdAt,
          SKU: m.productSku ?? '',
          Produto: m.productName ?? '',
          Tipo: m.type,
          Quantidade: m.quantity,
          'Saldo anterior': m.previousStock,
          'Saldo novo': m.newStock,
          Motivo: m.reason,
        })),
      })
    },
    async exportReportCsv(payload: {
      type: ReportType
      filters?: MovementFilters
      defaultName: string
    }) {
      const report = await this.getReport(payload.type, payload.filters)
      if (!report.ok) return report
      const header = report.data.columns.join(';')
      const lines = report.data.rows.map((row) =>
        report.data.columns
          .map((col) => `"${String(row[col] ?? '').replaceAll('"', '""')}"`)
          .join(';'),
      )
      const blob = new Blob([`\uFEFF${[header, ...lines].join('\n')}`], {
        type: 'text/csv;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = payload.defaultName
      a.click()
      URL.revokeObjectURL(url)
      return ok({ saved: true, path: payload.defaultName })
    },
    async listInvoices() {
      const list = invoices
        .map((invoice) => getInvoiceById(invoice.id)!)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return ok(list)
    },
    async getInvoice(id: string) {
      return ok(getInvoiceById(id))
    },
    async createInvoice(input: InvoiceInput) {
      const number = input.number.trim()
      if (!number) return fail('Número da fatura é obrigatório')
      if (!input.issueDate.trim()) return fail('Data da fatura é obrigatória')
      if (!input.items.length) return fail('Informe ao menos um item na fatura')
      if (invoices.some((i) => i.number.toLowerCase() === number.toLowerCase())) {
        return fail('Já existe uma fatura com este número')
      }

      const ts = now()
      const invoiceId = uid()
      const createdItems: InvoiceItem[] = []

      try {
        for (const item of input.items) {
          if (!(item.quantity > 0)) {
            return fail('Quantidade do item deve ser maior que zero')
          }
          const product = products.find((p) => p.id === item.productId)
          if (!product) return fail('Produto não encontrado')
          if (!product.active) return fail(`Produto inativo: ${product.name}`)

          const unitCost = item.unitCost ?? product.costPrice
          if (unitCost < 0) return fail('Custo unitário não pode ser negativo')

          const invoiceItem: InvoiceItem = {
            id: uid(),
            invoiceId,
            productId: item.productId,
            quantity: item.quantity,
            unitCost,
            productName: product.name,
            productSku: product.sku,
          }
          createdItems.push(invoiceItem)
          registerMovementInternal(
            {
              productId: item.productId,
              type: 'entrada',
              quantity: item.quantity,
              reason: 'Entrada por fatura',
              reference: number,
            },
            ts,
          )
        }
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }

      const supplier = input.supplierId
        ? suppliers.find((s) => s.id === input.supplierId)
        : undefined
      const invoice: Invoice = {
        id: invoiceId,
        number,
        supplierId: input.supplierId || null,
        issueDate: input.issueDate.trim(),
        notes: input.notes?.trim() ?? '',
        createdAt: ts,
        supplierName: supplier?.name ?? null,
      }
      invoices.push(invoice)
      invoiceItems.push(...createdItems)
      return ok(getInvoiceById(invoiceId)!)
    },
    async getProductRecipe(finishedProductId: string) {
      const list = recipes
        .filter((r) => r.finishedProductId === finishedProductId)
        .map((r) => {
          const material = products.find((p) => p.id === r.materialProductId)
          return {
            ...r,
            materialName: material?.name,
            materialSku: material?.sku,
            materialUnit: material?.unit,
            materialStock: material?.stock,
          }
        })
        .sort((a, b) => (a.materialName ?? '').localeCompare(b.materialName ?? ''))
      return ok(list)
    },
    async saveProductRecipe(input: ProductRecipeInput) {
      const finished = products.find((p) => p.id === input.finishedProductId)
      if (!finished) return fail('Produto acabado não encontrado')
      if (!finished.active) return fail('Produto acabado inativo não pode ter ficha técnica')
      if (!FINISHED_PRODUCT_TYPES.includes(finished.productType)) {
        return fail('A ficha técnica só pode ser cadastrada para produto final')
      }

      const seen = new Set<string>()
      for (const item of input.items) {
        if (!(item.quantity > 0)) {
          return fail('Quantidade da matéria-prima deve ser maior que zero')
        }
        if (item.materialProductId === input.finishedProductId) {
          return fail('O produto acabado não pode ser matéria-prima de si mesmo')
        }
        if (seen.has(item.materialProductId)) {
          return fail('Matéria-prima duplicada na ficha técnica')
        }
        seen.add(item.materialProductId)
        const material = products.find((p) => p.id === item.materialProductId)
        if (!material) return fail('Matéria-prima não encontrada')
        if (!material.active) return fail(`Matéria-prima inativa: ${material.name}`)
        if (!MATERIAL_PRODUCT_TYPES.includes(material.productType)) {
          return fail(`${material.name} deve ser matéria-prima ou insumo`)
        }
      }

      for (let i = recipes.length - 1; i >= 0; i--) {
        if (recipes[i].finishedProductId === input.finishedProductId) {
          recipes.splice(i, 1)
        }
      }

      for (const item of input.items) {
        recipes.push({
          id: uid(),
          finishedProductId: input.finishedProductId,
          materialProductId: item.materialProductId,
          quantity: item.quantity,
        })
      }

      return this.getProductRecipe(input.finishedProductId)
    },
    async listManufacturingOrders() {
      const list = manufacturingOrders
        .map((order) => {
          const product = products.find((p) => p.id === order.finishedProductId)
          return {
            ...order,
            finishedProductName: product?.name,
            finishedProductSku: product?.sku,
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return ok(list)
    },
    async createManufacturingOrder(input: ManufacturingInput) {
      if (!(input.quantity > 0)) return fail('Quantidade produzida deve ser maior que zero')

      const finished = products.find((p) => p.id === input.finishedProductId)
      if (!finished) return fail('Produto acabado não encontrado')
      if (!finished.active) return fail('Produto acabado inativo não pode ser fabricado')
      if (!FINISHED_PRODUCT_TYPES.includes(finished.productType)) {
        return fail('Somente produto final pode ser fabricado')
      }

      const recipeRes = await this.getProductRecipe(input.finishedProductId)
      if (!recipeRes.ok) return recipeRes
      const recipe = recipeRes.data
      if (!recipe.length) {
        return fail('Cadastre a ficha técnica (matérias-primas) antes de fabricar')
      }

      for (const item of recipe) {
        const required = item.quantity * input.quantity
        const stock = item.materialStock ?? 0
        if (required > stock) {
          return fail(
            `Saldo insuficiente de ${item.materialName ?? 'matéria-prima'}. Necessário: ${required}, disponível: ${stock}`,
          )
        }
      }

      const ts = now()
      const orderId = uid()
      const reference = `FAB-${orderId.slice(0, 8).toUpperCase()}`

      try {
        for (const item of recipe) {
          registerMovementInternal(
            {
              productId: item.materialProductId,
              type: 'saida',
              quantity: item.quantity * input.quantity,
              reason: 'Baixa por fabricação',
              reference,
            },
            ts,
          )
        }
        registerMovementInternal(
          {
            productId: input.finishedProductId,
            type: 'entrada',
            quantity: input.quantity,
            reason: 'Entrada por fabricação',
            reference,
          },
          ts,
        )
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }

      const order: ManufacturingOrder = {
        id: orderId,
        finishedProductId: input.finishedProductId,
        quantity: input.quantity,
        notes: input.notes?.trim() ?? '',
        createdAt: ts,
        finishedProductName: finished.name,
        finishedProductSku: finished.sku,
      }
      manufacturingOrders.unshift(order)
      return ok(order)
    },
  }
}

const memory = createMemoryApi()

export const api = new Proxy({} as typeof memory, {
  get(_target, prop: keyof typeof memory) {
    if (typeof window !== 'undefined' && window.estoque && prop in window.estoque) {
      return window.estoque[prop as keyof typeof window.estoque]
    }
    return memory[prop]
  },
})

export async function unwrap<T>(promise: Promise<ApiResponse<T>>): Promise<T> {
  const res = await promise
  if (!res.ok) throw new Error(res.error)
  return res.data
}
