/**
 * Apply SQL migrations from server/db/migrations.
 * Usage: npm run db:migrate
 */
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Copy .env.example to .env and start Postgres.')
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.join(__dirname, 'migrations')

const client = postgres(databaseUrl, { max: 1 })
const db = drizzle(client)

await migrate(db, { migrationsFolder })
await client.end()

console.info(
  JSON.stringify({
    event: 'db_migrate_complete',
    migrationsFolder,
  })
)
