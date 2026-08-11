import { randomUUID } from 'node:crypto'
import type { BoPipeline, BoPipelineStage } from '@/lib/db'

// The 5 stages every deal used before pipelines existed — kept as the
// default pipeline's stage keys so pre-existing bo_deals.stage values
// (already live in production) keep matching without a data migration.
const DEFAULT_STAGES: { key: string; name: string }[] = [
  { key: 'lead', name: 'Leads' },
  { key: 'opportunity', name: 'Opportunities' },
  { key: 'quote', name: 'Quotes' },
  { key: 'won', name: 'Won' },
  { key: 'lost', name: 'Lost' },
]

function slugifyKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'stage'
  )
}

// Idempotent — the first time an org's pipelines are touched, creates the
// default pipeline + backfills any pipeline_id-less deals onto it. Every
// subsequent call is a no-op past the first SELECT. Same lazy-provisioning
// shape as other per-org resources in this codebase rather than a one-time
// migration script.
export async function ensureDefaultPipeline(sql: any, organizationId: string): Promise<BoPipeline> {
  const existing = (await sql`
    SELECT * FROM bo_pipelines WHERE organization_id = ${organizationId} AND is_default = true LIMIT 1
  `) as unknown as BoPipeline[]
  if (existing[0]) return existing[0]

  const id = randomUUID()
  await sql`
    INSERT INTO bo_pipelines (id, organization_id, name, is_default, position)
    VALUES (${id}, ${organizationId}, 'Sales Pipeline', true, 0)
  `
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    await sql`
      INSERT INTO bo_pipeline_stages (id, pipeline_id, key, name, position)
      VALUES (${randomUUID()}, ${id}, ${DEFAULT_STAGES[i].key}, ${DEFAULT_STAGES[i].name}, ${i})
    `
  }
  await sql`
    UPDATE bo_deals SET pipeline_id = ${id} WHERE organization_id = ${organizationId} AND pipeline_id IS NULL
  `

  const rows = (await sql`SELECT * FROM bo_pipelines WHERE id = ${id}`) as unknown as BoPipeline[]
  return rows[0]
}

export async function listPipelinesWithStages(
  sql: any,
  organizationId: string
): Promise<(BoPipeline & { stages: BoPipelineStage[] })[]> {
  await ensureDefaultPipeline(sql, organizationId)

  const pipelines = (await sql`
    SELECT * FROM bo_pipelines WHERE organization_id = ${organizationId} ORDER BY position ASC, created_at ASC
  `) as unknown as BoPipeline[]
  const stages = (await sql`
    SELECT s.* FROM bo_pipeline_stages s
    JOIN bo_pipelines p ON p.id = s.pipeline_id
    WHERE p.organization_id = ${organizationId}
    ORDER BY s.position ASC, s.created_at ASC
  `) as unknown as BoPipelineStage[]

  return pipelines.map((p) => ({ ...p, stages: stages.filter((s) => s.pipeline_id === p.id) }))
}

export async function getPipelineStages(sql: any, pipelineId: string): Promise<BoPipelineStage[]> {
  return (await sql`
    SELECT * FROM bo_pipeline_stages WHERE pipeline_id = ${pipelineId} ORDER BY position ASC, created_at ASC
  `) as unknown as BoPipelineStage[]
}

// Generates a unique-within-pipeline stage key from a display name —
// used when a user adds a new stage to any pipeline (default or custom).
export async function uniqueStageKey(sql: any, pipelineId: string, name: string): Promise<string> {
  const base = slugifyKey(name)
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomUUID().slice(0, 6)}`
    const existing = (await sql`SELECT 1 FROM bo_pipeline_stages WHERE pipeline_id = ${pipelineId} AND key = ${candidate}`) as unknown[]
    if (existing.length === 0) return candidate
  }
  return `${base}-${randomUUID().slice(0, 8)}`
}
