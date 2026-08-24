import type { Db, Migration } from '../types'

function hasColumn(database: Db, table: string, column: string): boolean {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .some((item) => item.name === column)
}

export const securePasswordHistoryMigration: Migration = {
  version: 5,
  name: '005-secure-password-history',
  up(database) {
    if (!hasColumn(database, 'users', 'must_change_password')) {
      database.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0')
    }
    database.exec(`
      CREATE TABLE IF NOT EXISTS password_history (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_password_history_user_created
        ON password_history(user_id, created_at DESC);
    `)
  },
}
