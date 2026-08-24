export function statusLabel(status: string): string {
  if (status === 'active') return 'Ativo'
  if (status === 'inactive') return 'Inativo'
  if (status === 'zero') return 'Esgotado'
  if (status === 'low') return 'Baixo'
  return 'Normal'
}

export function movementLabel(type: string): string {
  if (type === 'entrada') return 'Entrada'
  if (type === 'saida') return 'Saída'
  return 'Ajuste'
}

export function productKindLabel(kind: string): string {
  if (kind === 'acabado') return 'Produto final'
  return 'Matéria-prima'
}

export function movementOriginLabel(origin: string): string {
  if (origin === 'fatura') return 'Fatura'
  if (origin === 'fabricacao_consumo') return 'Fabricação (consumo)'
  if (origin === 'fabricacao_producao') return 'Fabricação (produção)'
  if (origin === 'fatura_saida') return 'Faturação de saída'
  if (origin === 'ajuste') return 'Ajuste manual'
  if (origin === 'estorno') return 'Estorno'
  if (origin === 'inventario_fisico') return 'Inventário físico'
  if (origin === 'seed') return 'Demonstração'
  return 'Legado'
}

export function roleLabel(role: string): string {
  if (role === 'admin') return 'Administrador'
  return 'Operador'
}

export function operationStatusLabel(status: string): string {
  if (status === 'rascunho') return 'Rascunho'
  if (status === 'cancelado') return 'Cancelado'
  if (status === 'estornado') return 'Estornado'
  return 'Confirmado'
}

export function operationStatusBadgeClass(status: string): string {
  if (status === 'cancelado') return 'badge-zero'
  if (status === 'estornado') return 'badge-low'
  if (status === 'rascunho') return 'badge-neutral'
  return 'badge-ok'
}

export function inventoryStatusLabel(status: string): string {
  if (status === 'aberto') return 'Aberto'
  if (status === 'em_contagem') return 'Em contagem'
  if (status === 'aguarda_aprovacao') return 'Aguarda aprovação'
  if (status === 'aprovado') return 'Aprovado'
  return 'Cancelado'
}

export function inventoryStatusBadgeClass(status: string): string {
  if (status === 'aprovado') return 'badge-ok'
  if (status === 'cancelado') return 'badge-zero'
  if (status === 'aguarda_aprovacao') return 'badge-low'
  return 'badge-neutral'
}
