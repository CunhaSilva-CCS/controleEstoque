export function statusLabel(status: string): string {
  if (status === 'zero') return 'Zerado'
  if (status === 'low') return 'Baixo'
  return 'Normal'
}

export function movementLabel(type: string): string {
  if (type === 'entrada') return 'Entrada'
  if (type === 'saida') return 'Saída'
  return 'Ajuste'
}

export function productKindLabel(kind: string): string {
  if (kind === 'acabado') return 'Acabado'
  return 'Insumo'
}

export function movementOriginLabel(origin: string): string {
  if (origin === 'fatura') return 'Fatura'
  if (origin === 'fabricacao_consumo') return 'Fabricação (consumo)'
  if (origin === 'fabricacao_producao') return 'Fabricação (produção)'
  if (origin === 'ajuste') return 'Ajuste manual'
  if (origin === 'seed') return 'Demonstração'
  return 'Legado'
}

export function roleLabel(role: string): string {
  if (role === 'admin') return 'Administrador'
  return 'Operador'
}
