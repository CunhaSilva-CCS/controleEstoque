import { randomUUID } from 'node:crypto'
import type { Category } from '../../../shared/types'
import type { Db } from '../types'

function map(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function listCategories(database: Db, activeOnly = false): Category[] {
  const sql = activeOnly
    ? 'SELECT * FROM categories WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM categories ORDER BY name'
  return (database.prepare(sql).all() as Record<string, unknown>[]).map(map)
}

export function createCategory(database: Db, input: { name: string; description?: string }, timestamp: string): Category {
  const name = input.name.trim()
  if (!name) throw new Error('Nome da categoria é obrigatório')

  const id = randomUUID()
  try {
    database
      .prepare(
        `INSERT INTO categories (id, name, description, active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(id, name, input.description?.trim() ?? '', timestamp, timestamp)
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Já existe uma categoria com este nome')
    throw err
  }
  return listCategories(database).find((c) => c.id === id)!
}

export function updateCategory(
  database: Db,
  input: { id: string; name: string; description?: string; active: boolean },
  timestamp: string,
): Category {
  const name = input.name.trim()
  if (!name) throw new Error('Nome da categoria é obrigatório')

  if (!input.active) {
    const linked = database
      .prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND active = 1')
      .get(input.id) as { c: number }
    if (linked.c > 0) {
      throw new Error(`Não é possível inativar: há ${linked.c} produto(s) ativo(s) nesta categoria`)
    }
  }

  try {
    const result = database
      .prepare(`UPDATE categories SET name = ?, description = ?, active = ?, updated_at = ? WHERE id = ?`)
      .run(name, input.description?.trim() ?? '', input.active ? 1 : 0, timestamp, input.id)
    if (result.changes === 0) throw new Error('Categoria não encontrada')
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Já existe uma categoria com este nome')
    throw err
  }
  return listCategories(database).find((c) => c.id === input.id)!
}
