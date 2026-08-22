import type {
  ApiResponse,
  Category,
  DashboardData,
  MovementFilters,
  MovementInput,
  Product,
  ProductFilters,
  ProductInput,
  ProductStatus,
  ProductUpdateInput,
  ReportType,
  StockMovement,
  Supplier,
} from '@shared/types'

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

  return {
    async init() {
      return ok({ path: ':memory:', seeded })
    },
    async seed(accept: boolean) {
      seeded = true
      if (!accept) return ok(true)
      const ts = now()
      const catId = uid()
      categories.push({
        id: catId,
        name: 'Geral',
        description: 'Categoria padrão',
        active: true,
        createdAt: ts,
        updatedAt: ts,
      })
      const supId = uid()
      suppliers.push({
        id: supId,
        name: 'Fornecedor Demo',
        document: '',
        phone: '',
        email: '',
        notes: '',
        active: true,
        createdAt: ts,
        updatedAt: ts,
      })
      const demo: Omit<Product, 'status' | 'stockValue' | 'categoryName' | 'supplierName'>[] = [
        {
          id: uid(),
          sku: 'DEMO-001',
          name: 'Produto demonstração',
          description: '',
          categoryId: catId,
          supplierId: supId,
          unit: 'un',
          costPrice: 10,
          salePrice: 20,
          minStock: 5,
          stock: 12,
          active: true,
          createdAt: ts,
          updatedAt: ts,
        },
      ]
      products.push(...demo.map(enrich))
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
      const initial = input.initialStock ?? 0
      const ts = now()
      const p: Product = enrich({
        id: uid(),
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
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
      Object.assign(p, {
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
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
      const p = products.find((x) => x.id === input.productId)
      if (!p) return fail('Produto não encontrado')
      if (!p.active) return fail('Produto inativo não pode receber movimentações')
      if (!input.reason.trim()) return fail('Motivo é obrigatório')

      const previous = p.stock
      let quantity = input.quantity
      let newStock: number

      if (input.type === 'entrada') {
        if (!(quantity > 0)) return fail('Quantidade da entrada deve ser maior que zero')
        newStock = previous + quantity
      } else if (input.type === 'saida') {
        if (!(quantity > 0)) return fail('Quantidade da saída deve ser maior que zero')
        if (quantity > previous) return fail(`Saldo insuficiente. Disponível: ${previous}`)
        newStock = previous - quantity
      } else {
        if (input.newStock === undefined || input.newStock < 0) {
          return fail('Informe o novo saldo (≥ 0) para o ajuste')
        }
        newStock = input.newStock
        quantity = newStock - previous
      }

      p.stock = newStock
      p.updatedAt = now()
      const m: StockMovement = {
        id: uid(),
        productId: p.id,
        type: input.type,
        quantity,
        previousStock: previous,
        newStock,
        reason: input.reason.trim(),
        reference: input.reference?.trim() ?? '',
        createdAt: now(),
        productName: p.name,
        productSku: p.sku,
      }
      movements.unshift(m)
      return ok(m)
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
          columns: ['SKU', 'Nome', 'Categoria', 'Saldo', 'Unidade', 'Custo', 'Valor', 'Status'],
          rows: list.map((p) => ({
            SKU: p.sku,
            Nome: p.name,
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
