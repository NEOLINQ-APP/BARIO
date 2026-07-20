// One-off script: upserts premium template HTML into the `templates` table.
// Run locally with DATABASE_URL set in the environment:
//   DATABASE_URL="postgres://..." node scripts/seed-templates.mjs
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sourceDir = path.join(__dirname, '..', 'templates-source')

const TEMPLATES = [
  {
    id: 'omnihub-directory',
    file: 'omnihub-directory.html',
    title: 'OmniHub Multi-Industry Business Directory',
    category: 'Business Directory / Marketplace Hub',
    description: 'A sidebar-driven directory app showcasing multiple business sectors (medical, rental, fitness, tech, hosting, dev agency) under one brand, each with its own interactive booking/quote tool.',
    price_cents: 9900,
  },
  {
    id: 'apex-motors',
    file: 'apex-motors.html',
    title: 'Apex Motors Luxury Auto Dealership',
    category: 'Automotive Dealership',
    description: 'Tabbed dealership site with live filterable vehicle inventory, a financing/loan payment calculator, and a parts & service storefront.',
    price_cents: 9900,
  },
]

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) throw new Error('Set DATABASE_URL in the environment before running this script')
  const sql = neon(url)

  for (const t of TEMPLATES) {
    const html = readFileSync(path.join(sourceDir, t.file), 'utf8')
    await sql`
      INSERT INTO templates (id, title, category, description, html, is_premium, price_cents)
      VALUES (${t.id}, ${t.title}, ${t.category}, ${t.description}, ${html}, true, ${t.price_cents})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        html = EXCLUDED.html,
        price_cents = EXCLUDED.price_cents
    `
    console.log(`Upserted: ${t.id}`)
  }
}

main().then(() => {
  console.log('Done.')
  process.exit(0)
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
