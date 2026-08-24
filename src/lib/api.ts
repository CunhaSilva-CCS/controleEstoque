import type {
  ApiResponse,
  Category,
  DashboardData,
  MovementFilters,
  MovementInput,
  MovementOrigin,
  MovementType,
  Product,
  ProductFilters,
  ProductInput,
  ProductStatus,
  ProductUpdateInput,
  ProductionInput,
  ProductionOrder,
  PurchaseInvoice,
  PurchaseInvoiceInput,
  Recipe,
  RecipeInput,
  ReportType,
  StockMovement,
  Supplier,
  UpdateStatus,
  ClientBrand,
  User,
  LoginInput,
  ChangePasswordInput,
  AuthSession,
} from '@shared/types'
import { movementLabel, statusLabel } from '@shared/labels'

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
  const recipes: Recipe[] = []
  const invoices: PurchaseInvoice[] = []
  const productionOrders: ProductionOrder[] = []
  let clientBrand: ClientBrand = { name: '', logoDataUrl: '' }
  const users: User[] = []
  const passwords = new Map<string, string>()
  let sessionUserId = ''
  let seeded = false
  const DEFAULT_PASSWORD = 'admin123'

  function sessionUser(): User | undefined {
    return users.find((u) => u.id === sessionUserId)
  }

  function adminError(): string | null {
    const user = sessionUser()
    if (!user) return 'Sessão expirada. Entre novamente.'
    if (user.mustChangePassword) return 'Altere a senha antes de continuar'
    if (user.role !== 'admin') return 'Acesso restrito ao administrador'
    return null
  }

  function assertNewPassword(newPassword: string, currentPassword: string): string | null {
    if (newPassword.length < 6) return 'Senha deve ter no mínimo 6 caracteres'
    if (newPassword === currentPassword) return 'A nova senha deve ser diferente da atual'
    if (newPassword === DEFAULT_PASSWORD) return 'Não use a senha padrão. Escolha outra senha.'
    return null
  }

  function applyMemoryMovement(input: {
    productId: string
    type: MovementType
    quantity?: number
    newStock?: number
    reason: string
    reference: string
    origin: MovementOrigin
  }): StockMovement | string {
    const p = products.find((x) => x.id === input.productId)
    if (!p) return 'Produto não encontrado'
    if (!p.active) return 'Produto inativo não pode receber movimentações'
    if (!input.reason.trim()) return 'Motivo é obrigatório'

    const previous = p.stock
    let quantity = input.quantity ?? 0
    let newStock: number

    if (input.type === 'entrada') {
      if (!(quantity > 0)) return 'Quantidade da entrada deve ser maior que zero'
      newStock = previous + quantity
    } else if (input.type === 'saida') {
      if (!(quantity > 0)) return 'Quantidade da saída deve ser maior que zero'
      if (quantity > previous) return `Saldo insuficiente. Disponível: ${previous}`
      newStock = previous - quantity
    } else {
      if (input.newStock === undefined || input.newStock < 0) {
        return 'Informe o novo saldo (≥ 0) para o ajuste'
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
      reference: input.reference,
      origin: input.origin,
      createdAt: now(),
      productName: p.name,
      productSku: p.sku,
    }
    movements.unshift(m)
    return m
  }

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
      if (users.length === 0) {
        const ts = now()
        const admin: User = {
          id: uid(),
          name: 'Administrador',
          username: 'admin',
          role: 'admin',
          active: true,
          mustChangePassword: true,
          createdAt: ts,
          updatedAt: ts,
        }
        users.push(admin)
        passwords.set(admin.id, DEFAULT_PASSWORD)
      }
      return ok({ path: ':memory:', seeded })
    },
    async authStatus() {
      const user = users.find((u) => u.id === sessionUserId) ?? null
      const payload: AuthSession = { authenticated: Boolean(user), user }
      return ok(payload)
    },
    async login(input: LoginInput) {
      const user = users.find(
        (u) => u.active && u.username.toLowerCase() === input.username.trim().toLowerCase(),
      )
      if (!user || passwords.get(user.id) !== input.password) return fail('Usuário ou senha inválidos')
      sessionUserId = user.id
      const payload: AuthSession = { authenticated: true, user }
      return ok(payload)
    },
    async logout() {
      sessionUserId = ''
      return ok(true)
    },
    async changePassword(input: ChangePasswordInput) {
      const user = sessionUser()
      if (!user) return fail('Sessão expirada. Entre novamente.')
      if (passwords.get(user.id) !== input.currentPassword) return fail('Senha atual incorreta')
      const invalid = assertNewPassword(input.newPassword, input.currentPassword)
      if (invalid) return fail(invalid)
      passwords.set(user.id, input.newPassword)
      user.mustChangePassword = false
      user.updatedAt = now()
      const payload: AuthSession = { authenticated: true, user }
      return ok(payload)
    },
    async listUsers() {
      const denied = adminError()
      if (denied) return fail(denied)
      return ok([...users].sort((a, b) => a.name.localeCompare(b.name)))
    },
    async createUser(input: { name: string; username: string; password: string; role: 'admin' | 'operador' }) {
      const denied = adminError()
      if (denied) return fail(denied)
      const name = input.name.trim()
      const username = input.username.trim()
      if (!name) return fail('Nome do usuário é obrigatório')
      if (!username) return fail('Usuário é obrigatório')
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        return fail('Este usuário já está cadastrado')
      }
      if (input.password.length < 6) return fail('Senha deve ter no mínimo 6 caracteres')
      const ts = now()
      const user: User = {
        id: uid(),
        name,
        username,
        role: input.role,
        active: true,
        mustChangePassword: false,
        createdAt: ts,
        updatedAt: ts,
      }
      users.push(user)
      passwords.set(user.id, input.password)
      return ok(user)
    },
    async setUserActive(id: string, active: boolean) {
      const denied = adminError()
      if (denied) return fail(denied)
      const user = users.find((u) => u.id === id)
      if (!user) return fail('Usuário não encontrado')
      if (!active && user.role === 'admin' && users.filter((u) => u.active && u.role === 'admin').length <= 1) {
        return fail('Não é possível desativar o último administrador')
      }
      user.active = active
      user.updatedAt = now()
      if (!active && sessionUserId === id) sessionUserId = ''
      return ok(user)
    },
    async seed(accept: boolean) {
      const denied = adminError()
      if (denied) return fail(denied)
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
          categoryId: catEletronicos,
          supplierId: sup1,
          kind: 'insumo' as const,
          unit: 'un',
          costPrice: 8.5,
          salePrice: 19.9,
          minStock: 10,
          stock: 45,
        },
        {
          sku: 'MOUSE-OP',
          name: 'Mouse óptico USB',
          categoryId: catEletronicos,
          supplierId: sup1,
          kind: 'insumo' as const,
          unit: 'un',
          costPrice: 22,
          salePrice: 49.9,
          minStock: 5,
          stock: 3,
        },
        {
          sku: 'CANETA-AZ',
          name: 'Caneta esferográfica azul',
          categoryId: catEscritorio,
          supplierId: sup2,
          kind: 'insumo' as const,
          unit: 'cx',
          costPrice: 12,
          salePrice: 24,
          minStock: 8,
          stock: 20,
        },
        {
          sku: 'RESMA-A4',
          name: 'Resma papel A4 500 folhas',
          categoryId: catEscritorio,
          supplierId: sup2,
          kind: 'insumo' as const,
          unit: 'un',
          costPrice: 18,
          salePrice: 32,
          minStock: 15,
          stock: 0,
        },
        {
          sku: 'KIT-OFFICE',
          name: 'Kit escritório montado',
          categoryId: catGeral,
          supplierId: null as string | null,
          kind: 'acabado' as const,
          unit: 'un',
          costPrice: 35,
          salePrice: 69.9,
          minStock: 3,
          stock: 0,
        },
      ]
      const insumoIds: Record<string, string> = {}
      for (const item of demo) {
        const id = uid()
        if (item.kind === 'insumo') insumoIds[item.sku] = id
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
            reason: 'Demonstração',
            reference: 'Demonstração',
            origin: 'seed',
            createdAt: ts,
            productName: item.name,
            productSku: item.sku,
          })
        }
      }
      const finished = products.find((p) => p.sku === 'KIT-OFFICE')
      if (finished && insumoIds['CANETA-AZ'] && insumoIds['RESMA-A4']) {
        recipes.push({
          id: uid(),
          productId: finished.id,
          productName: finished.name,
          productSku: finished.sku,
          notes: 'Kit de demonstração',
          active: true,
          createdAt: ts,
          updatedAt: ts,
          items: [
            {
              id: uid(),
              productId: insumoIds['CANETA-AZ'],
              productName: 'Caneta esferográfica azul',
              productSku: 'CANETA-AZ',
              quantity: 1,
            },
            {
              id: uid(),
              productId: insumoIds['RESMA-A4'],
              productName: 'Resma papel A4 500 folhas',
              productSku: 'RESMA-A4',
              quantity: 1,
            },
          ],
        })
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
      if (filters.kind) list = list.filter((p) => p.kind === filters.kind)
      if (filters.active !== undefined) list = list.filter((p) => p.active === filters.active)
      if (filters.lowStockOnly) list = list.filter((p) => p.stock <= p.minStock)
      return ok(list.sort((a, b) => a.name.localeCompare(b.name)))
    },
    async getProduct(id: string) {
      const p = products.find((x) => x.id === id)
      return ok(p ? enrich(p) : null)
    },
    async createProduct(input: ProductInput) {
      if (!input.sku.trim()) return fail('Código é obrigatório')
      if (!input.name.trim()) return fail('Nome do produto é obrigatório')
      if (products.some((p) => p.sku.toLowerCase() === input.sku.trim().toLowerCase())) {
        return fail('Já existe um produto com este código')
      }
      const ts = now()
      const p: Product = enrich({
        id: uid(),
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        categoryId: input.categoryId || null,
        supplierId: input.supplierId || null,
        kind: input.kind ?? 'insumo',
        unit: input.unit.trim(),
        costPrice: input.costPrice,
        salePrice: input.salePrice,
        minStock: input.minStock,
        stock: 0,
        active: true,
        createdAt: ts,
        updatedAt: ts,
      })
      products.push(p)
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
        return fail('Já existe um produto com este código')
      }
      Object.assign(p, {
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        categoryId: input.categoryId || null,
        supplierId: input.supplierId || null,
        kind: input.kind,
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
      if (input.type !== 'ajuste') {
        return fail(
          'Entrada e saída só podem ser registradas por fatura de compra ou fabricação. Use ajuste para inventário.',
        )
      }
      const result = applyMemoryMovement({
        productId: input.productId,
        type: 'ajuste',
        quantity: input.quantity,
        newStock: input.newStock,
        reason: input.reason,
        reference: input.reference?.trim() ?? '',
        origin: 'ajuste',
      })
      if (typeof result === 'string') return fail(result)
      return ok(result)
    },
    async listPurchaseInvoices() {
      return ok([...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    },
    async createPurchaseInvoice(input: PurchaseInvoiceInput) {
      const number = input.number.trim()
      if (!number) return fail('Número da fatura é obrigatório')
      if (!input.issueDate) return fail('Data da fatura é obrigatória')
      if (!input.items.length) return fail('Informe ao menos um item na fatura')

      const ts = now()
      const invoiceId = uid()
      const items = []

      for (const item of input.items) {
        const p = products.find((x) => x.id === item.productId)
        if (!p) return fail('Produto não encontrado')
        if (!p.active) return fail('Produto inativo não pode entrar por fatura')
        if (p.kind !== 'insumo') return fail('Entrada por fatura permitida apenas para insumos')
        if (!(item.quantity > 0)) return fail('Quantidade do item deve ser maior que zero')

        const mov = applyMemoryMovement({
          productId: p.id,
          type: 'entrada',
          quantity: item.quantity,
          reason: `Fatura ${number}`,
          reference: invoiceId,
          origin: 'fatura',
        })
        if (typeof mov === 'string') return fail(mov)
        p.costPrice = item.unitCost
        p.updatedAt = ts
        items.push({
          id: uid(),
          productId: p.id,
          productName: p.name,
          productSku: p.sku,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })
      }

      const invoice: PurchaseInvoice = {
        id: invoiceId,
        number,
        supplierId: input.supplierId || null,
        supplierName: suppliers.find((s) => s.id === input.supplierId)?.name ?? null,
        issueDate: input.issueDate,
        notes: input.notes?.trim() ?? '',
        createdAt: ts,
        items,
      }
      invoices.unshift(invoice)
      return ok(invoice)
    },
    async listRecipes() {
      return ok([...recipes].sort((a, b) => a.productName.localeCompare(b.productName)))
    },
    async getRecipe(productId: string) {
      return ok(recipes.find((r) => r.productId === productId) ?? null)
    },
    async saveRecipe(input: RecipeInput) {
      if (!input.items.length) return fail('Informe ao menos um insumo na receita')
      const product = products.find((p) => p.id === input.productId)
      if (!product) return fail('Produto acabado não encontrado')
      if (product.kind !== 'acabado') return fail('Receita disponível apenas para produto acabado')

      for (const item of input.items) {
        const insumo = products.find((p) => p.id === item.productId)
        if (!insumo) return fail('Insumo não encontrado')
        if (insumo.kind !== 'insumo') return fail('Receita aceita apenas insumos como componentes')
      }

      const ts = now()
      const existing = recipes.find((r) => r.productId === input.productId)
      const recipe: Recipe = {
        id: existing?.id ?? uid(),
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        notes: input.notes?.trim() ?? '',
        active: true,
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
        items: input.items.map((item) => {
          const insumo = products.find((p) => p.id === item.productId)!
          return {
            id: uid(),
            productId: insumo.id,
            productName: insumo.name,
            productSku: insumo.sku,
            quantity: item.quantity,
          }
        }),
      }
      if (existing) {
        const idx = recipes.indexOf(existing)
        recipes[idx] = recipe
      } else {
        recipes.push(recipe)
      }
      return ok(recipe)
    },
    async listProductionOrders() {
      return ok([...productionOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    },
    async createProduction(input: ProductionInput) {
      if (!(input.quantity > 0)) return fail('Quantidade produzida deve ser maior que zero')
      const product = products.find((p) => p.id === input.productId)
      if (!product) return fail('Produto não encontrado')
      if (product.kind !== 'acabado') return fail('Fabricação disponível apenas para produto acabado')
      const recipe = recipes.find((r) => r.productId === input.productId)
      if (!recipe?.items.length) {
        return fail('Cadastre a receita do produto acabado antes de fabricar')
      }

      for (const item of recipe.items) {
        const insumo = products.find((p) => p.id === item.productId)
        if (!insumo) return fail('Insumo não encontrado')
        const needed = item.quantity * input.quantity
        if (insumo.stock < needed) {
          return fail(
            `Saldo insuficiente de ${insumo.name}. Necessário: ${needed}, disponível: ${insumo.stock}`,
          )
        }
      }

      const orderId = uid()
      const ts = now()
      for (const item of recipe.items) {
        const qty = item.quantity * input.quantity
        const mov = applyMemoryMovement({
          productId: item.productId,
          type: 'saida',
          quantity: qty,
          reason: `Fabricação · ${product.name}`,
          reference: orderId,
          origin: 'fabricacao_consumo',
        })
        if (typeof mov === 'string') return fail(mov)
      }

      const entrada = applyMemoryMovement({
        productId: product.id,
        type: 'entrada',
        quantity: input.quantity,
        reason: `Fabricação · ${product.name}`,
        reference: orderId,
        origin: 'fabricacao_producao',
      })
      if (typeof entrada === 'string') return fail(entrada)

      const order: ProductionOrder = {
        id: orderId,
        recipeId: recipe.id,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        quantity: input.quantity,
        notes: input.notes?.trim() ?? '',
        createdAt: ts,
      }
      productionOrders.unshift(order)
      return ok(order)
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
          columns: ['Código', 'Nome', 'Categoria', 'Saldo', 'Unidade', 'Custo', 'Valor', 'Status'],
          rows: list.map((p) => ({
            Código: p.sku,
            Nome: p.name,
            Categoria: p.categoryName ?? '',
            Saldo: p.stock,
            Unidade: p.unit,
            Custo: p.costPrice,
            Valor: p.stockValue ?? 0,
            Status: statusLabel(p.status ?? 'ok'),
          })),
        })
      }
      if (type === 'baixo') {
        const res = await this.listProducts({ active: true, lowStockOnly: true })
        const list = res.ok ? res.data : []
        return ok({
          columns: ['Código', 'Nome', 'Saldo', 'Mínimo', 'Diferença', 'Status'],
          rows: list.map((p) => ({
            Código: p.sku,
            Nome: p.name,
            Saldo: p.stock,
            Mínimo: p.minStock,
            Diferença: p.stock - p.minStock,
            Status: statusLabel(p.status ?? 'low'),
          })),
        })
      }
      const res = await this.listMovements(filters)
      const list = res.ok ? res.data : []
      return ok({
        columns: [
          'Data',
          'Código',
          'Produto',
          'Tipo',
          'Quantidade',
          'Saldo anterior',
          'Saldo novo',
          'Motivo',
        ],
        rows: list.map((m) => ({
          Data: m.createdAt,
          Código: m.productSku ?? '',
          Produto: m.productName ?? '',
          Tipo: movementLabel(m.type),
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
    async exportBackup() {
      const denied = adminError()
      if (denied) return fail(denied)
      return ok({ saved: true, path: 'memory-backup.db' })
    },
    async restoreBackup() {
      const denied = adminError()
      if (denied) return fail(denied)
      return ok({ restored: true, path: ':memory:' })
    },
    async getClientBrand() {
      return ok({ ...clientBrand })
    },
    async saveClientBrand(input: ClientBrand) {
      const denied = adminError()
      if (denied) return fail(denied)
      const name = input.name.trim()
      if (name.length > 80) return fail('Nome da empresa deve ter no máximo 80 caracteres')
      const logo = input.logoDataUrl.trim()
      if (logo && logo.length > 2_800_000) {
        return fail('A logo é muito grande. Use uma imagem de até 2 MB.')
      }
      if (
        logo &&
        !/^data:image\/(png|jpeg|jpg|webp|svg\+xml)/i.test(logo)
      ) {
        return fail('Use uma imagem PNG, JPG, WEBP ou SVG')
      }
      clientBrand = { name, logoDataUrl: logo }
      return ok({ ...clientBrand })
    },
    async getAppInfo() {
      return ok({ version: '1.0.0-web', dbPath: ':memory:', packaged: false })
    },
    async getUpdateStatus() {
      const denied = adminError()
      if (denied) return fail(denied)
      return ok({ state: 'disabled' as const, reason: 'Atualizações indisponíveis neste modo' })
    },
    async checkForUpdates() {
      const denied = adminError()
      if (denied) return fail(denied)
      return ok({ state: 'disabled' as const, reason: 'Atualizações indisponíveis neste modo' })
    },
    async installUpdate() {
      const denied = adminError()
      if (denied) return fail(denied)
      return fail('Atualizações indisponíveis neste modo')
    },
    onUpdateStatus(_callback: (status: UpdateStatus) => void) {
      return () => undefined
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
