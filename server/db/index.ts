import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export type Database = ReturnType<typeof createDb>

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: process.env.VERCEL ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // PgBouncer-style poolers (Neon "-pooler" hosts) run in transaction mode.
    prepare: !/-pooler\./.test(databaseUrl),
  })
  const db = drizzle(client, { schema })
  return { db, client }
}
