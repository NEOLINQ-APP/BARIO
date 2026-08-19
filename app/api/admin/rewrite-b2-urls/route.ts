import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-off migration, step 2 of the B2 -> MinIO cutover (step 1 was
// /api/admin/migrate-b2-to-storage, which copied every object to MinIO
// under the same key). Existing DB rows still point at the old B2 base URL
// even though the files now also exist in MinIO -- this rewrites every
// column found (via a real grep across every call site that writes a
// storage URL) to still hold a B2 URL, including ones where the URL is
// embedded inline inside an HTML/JSON blob rather than being its own
// column. A substring REPLACE() is correct in both cases: the object key
// itself never changes between backends, only the base URL in front of it,
// so swapping just that prefix -- wherever it appears in the column's text
// -- is a safe, lossless rewrite whether the column is a bare URL or a
// larger blob with a URL embedded in it.
//
// GET with no params: dry-run, counts affected rows per column, no writes.
// GET ?execute=true: actually runs the REPLACE()s.
export const maxDuration = 120

const OLD_BASE = process.env.B2_PUBLIC_BASE_URL || `https://${process.env.B2_BUCKET_NAME}.${process.env.B2_ENDPOINT}`
const NEW_BASE = process.env.STORAGE_PUBLIC_BASE_URL || `https://storage.bario.ca/${process.env.STORAGE_BUCKET_NAME || 'bario-storage'}`

const TARGETS: { table: string; column: string }[] = [
  { table: 'media_assets', column: 'url' },
  { table: 'assets', column: 'url' },
  { table: 'sites', column: 'favicon_url' },
  { table: 'sites', column: 'raw_html' },
  { table: 'sites', column: 'sections_json' },
  { table: 'site_pages', column: 'raw_html' },
  { table: 'bo_organizations', column: 'branding_logo_url' },
  { table: 'bo_expenses', column: 'receipt_image_url' },
  { table: 'staff_td1_records', column: 'federal_pdf_url' },
  { table: 'staff_td1_records', column: 'provincial_pdf_url' },
  { table: 'studio_jobs', column: 'output_url' },
  { table: 'bo_employees', column: 'document_urls_json' },
  { table: 'platform_settings', column: 'value' },
  { table: 'refund_requests', column: 'attachment_url' },
]

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const execute = new URL(req.url).searchParams.get('execute') === 'true'
    const results: { table: string; column: string; matched: number; updated?: number; error?: string }[] = []

    for (const { table, column } of TARGETS) {
      try {
        // Table/column names here come only from the hardcoded TARGETS list
        // above, never from request input -- safe to interpolate. Values
        // (OLD_BASE/NEW_BASE) go through sql.unsafe()'s own $1/$2 parameter
        // binding, same as the tagged-template form uses everywhere else in
        // this codebase.
        const countRows = await sql.unsafe(
          `SELECT count(*)::int AS n FROM ${table} WHERE ${column} LIKE '%backblazeb2.com%'`
        )
        const matched = Number((countRows as any)[0]?.n ?? 0)

        let updated: number | undefined
        if (execute && matched > 0) {
          const res = await sql.unsafe(
            `UPDATE ${table} SET ${column} = REPLACE(${column}, $1, $2) WHERE ${column} LIKE '%backblazeb2.com%'`,
            [OLD_BASE, NEW_BASE]
          )
          updated = (res as any).count ?? matched
        }

        results.push({ table, column, matched, updated: execute ? updated ?? 0 : undefined })
      } catch (err: any) {
        results.push({ table, column, matched: 0, error: err.message ?? String(err) })
      }
    }

    return NextResponse.json({
      ok: true,
      mode: execute ? 'executed' : 'dry-run',
      oldBase: OLD_BASE,
      newBase: NEW_BASE,
      results,
      totalMatched: results.reduce((s, r) => s + r.matched, 0),
      totalUpdated: execute ? results.reduce((s, r) => s + (r.updated ?? 0), 0) : undefined,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
