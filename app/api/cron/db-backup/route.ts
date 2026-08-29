import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { put } from '@/lib/storage'
import { gzipSync } from 'node:zlib'

// Real, ongoing full-database backup — every production DB Bario touches,
// dumped nightly to MinIO storage (a separate infrastructure provider from
// Supabase, so a Supabase-side incident can't take the backups out along
// with the live data). Added 2026-08-28 after spott.ca's DB was wiped once
// by a misused Prisma command with no way to recover anything — see
// standing_rule_no_destructive_actions_without_approval memory. This is a
// logical dump (every row, as JSON) rather than a physical pg_dump: none of
// these projects' direct Postgres passwords are available to this route,
// but the Supabase Management API's SQL endpoint gives the same real data
// without needing one, and restoring from JSON INSERTs is enough for actual
// disaster recovery.
export const maxDuration = 280

const SPOTT_REF = 'lsbaxeehjpfsdiaywbhn' // spott.ca's real, dedicated Supabase project
const NORCANECO_REF = 'tqllzodsdwtsmsdrhwyk' // NorCanEco's own Prisma-backed app DB

type Dump = { tableCount: number; totalRows: number; dump: Record<string, unknown> }

async function dumpViaManagementApi(ref: string, token: string): Promise<Dump> {
  async function runSql(query: string) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`Management API SQL failed (${res.status}): ${await res.text()}`)
    return res.json()
  }
  const tables = (await runSql(
    `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;`,
  )) as { table_name: string }[]
  const dump: Record<string, unknown> = {}
  let totalRows = 0
  for (const { table_name } of tables) {
    try {
      const rows = (await runSql(`select * from public."${table_name}";`)) as unknown[]
      dump[table_name] = rows
      totalRows += rows.length
    } catch (e: any) {
      dump[table_name] = { __error: e?.message ?? String(e) }
    }
  }
  return { tableCount: tables.length, totalRows, dump }
}

async function dumpBarioOwnDb(): Promise<Dump> {
  const sql = await db()
  const tables = (await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name;
  `) as { table_name: string }[]
  const dump: Record<string, unknown> = {}
  let totalRows = 0
  for (const { table_name } of tables) {
    try {
      const rows = await sql`select * from ${sql(table_name)};`
      dump[table_name] = rows
      totalRows += rows.length
    } catch (e: any) {
      dump[table_name] = { __error: e?.message ?? String(e) }
    }
  }
  return { tableCount: tables.length, totalRows, dump }
}

async function uploadBackup(project: string, payload: Dump) {
  const takenAt = new Date().toISOString()
  const json = JSON.stringify({ project, taken_at: takenAt, tableCount: payload.tableCount, totalRows: payload.totalRows, dump: payload.dump })
  const gz = gzipSync(Buffer.from(json, 'utf8'))
  const dateKey = takenAt.slice(0, 10) // YYYY-MM-DD — one snapshot per project per day, overwritten on same-day reruns
  const key = `backups/${project}/${project}-${dateKey}.json.gz`
  const result = await put(key, gz, { access: 'public', addRandomSuffix: false, contentType: 'application/gzip' })
  return { project, url: result.url, tableCount: payload.tableCount, totalRows: payload.totalRows, bytes: gz.length }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const spottToken = process.env.SPOTT_SUPABASE_MGMT_TOKEN
  const jobs: Array<Promise<{ project: string; url: string; tableCount: number; totalRows: number; bytes: number }>> = []
  const jobNames: string[] = []

  jobs.push(dumpBarioOwnDb().then((d) => uploadBackup('bario', d)))
  jobNames.push('bario')

  if (spottToken) {
    jobs.push(dumpViaManagementApi(SPOTT_REF, spottToken).then((d) => uploadBackup('spott-ca', d)))
    jobNames.push('spott-ca')
    jobs.push(dumpViaManagementApi(NORCANECO_REF, spottToken).then((d) => uploadBackup('norcaneco', d)))
    jobNames.push('norcaneco')
  }

  const settled = await Promise.allSettled(jobs)
  const results: unknown[] = []
  const errors: string[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(r.value)
    else errors.push(`${jobNames[i]}: ${r.reason?.message ?? r.reason}`)
  })
  if (!spottToken) errors.push('SPOTT_SUPABASE_MGMT_TOKEN not configured — spott-ca/norcaneco skipped this run')

  return NextResponse.json({ ok: errors.length === 0, results, errors })
}
