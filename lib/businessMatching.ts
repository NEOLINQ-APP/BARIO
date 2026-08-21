import Anthropic from '@anthropic-ai/sdk'
import type { BoCustomer } from '@/lib/db'

// Phase 8 (business matching engine) — the generic counterpart to AISHA's
// site-audit -> Bario-services matching (Phase 4), but for any Bario One
// org's OWN product/service catalog and OWN leads, not just prospects for
// Bario itself. Given a lead's known signals and a business's real
// bo_products rows, suggests which of THEIR products/services to pitch —
// helps a salesperson (or a future SCOUT/CLOSER task) know what to offer
// without re-reading the whole catalog by hand every time.

export type ProductMatch = { productId: string; name: string; reason: string }

const MATCH_TOOL: Anthropic.Tool = {
  name: 'submit_matches',
  description: 'Submit the products/services from the given catalog that best fit this lead.',
  input_schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'The exact id of a product from the catalog given' },
            reason: { type: 'string', description: 'One sentence: why this product fits this specific lead' },
          },
          required: ['productId', 'reason'],
        },
      },
    },
    required: ['matches'],
  },
}

export async function matchProductsToLead(sql: any, organizationId: string, customerId: string): Promise<{ ok: boolean; matches: ProductMatch[]; error?: string }> {
  const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${customerId} AND organization_id = ${organizationId}`) as unknown as BoCustomer[]
  const customer = customerRows[0]
  if (!customer) return { ok: false, matches: [], error: 'Lead not found' }

  const products = (await sql`
    SELECT id, name, sku, price_cents FROM bo_products WHERE organization_id = ${organizationId} AND status = 'active' ORDER BY name ASC LIMIT 50
  `) as unknown as { id: string; name: string; sku: string | null; price_cents: number }[]
  if (products.length === 0) return { ok: false, matches: [], error: 'This organization has no active products/services in its catalog yet' }

  const notesRows = (await sql`SELECT body FROM bo_notes WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 5`) as unknown as { body: string }[]

  let signals: Record<string, unknown> = {}
  try {
    signals = JSON.parse(customer.lead_signals_json || '{}')
  } catch {
    signals = {}
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, matches: [], error: 'AI matching is not configured' }
  const client = new Anthropic({ apiKey })

  const leadSummary = {
    contactName: customer.contact_name,
    companyName: customer.company_name,
    tags: (() => {
      try {
        return JSON.parse(customer.tags_json || '[]')
      } catch {
        return []
      }
    })(),
    knownSignals: signals,
    recentNotes: notesRows.map((n) => n.body).slice(0, 5),
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system:
        'You match a CRM lead to the products/services a business actually sells, from a real catalog given to you. Only ever recommend items that appear in the catalog (use their exact id) — never invent a product. If nothing in the catalog is a good fit, submit an empty matches array rather than forcing a weak match. Base your reasoning only on the real lead data given, not assumptions.',
      messages: [
        {
          role: 'user',
          content: `Lead:\n${JSON.stringify(leadSummary, null, 2)}\n\nCatalog:\n${JSON.stringify(products, null, 2)}`,
        },
      ],
      tools: [MATCH_TOOL],
      tool_choice: { type: 'tool', name: 'submit_matches' },
    })
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const input = toolUse?.input as { matches?: { productId: string; reason: string }[] } | undefined
    const rawMatches = Array.isArray(input?.matches) ? input!.matches : []

    const byId = new Map(products.map((p) => [p.id, p]))
    const matches: ProductMatch[] = rawMatches
      .filter((m) => byId.has(m.productId))
      .map((m) => ({ productId: m.productId, name: byId.get(m.productId)!.name, reason: m.reason }))

    await sql`UPDATE bo_customers SET suggested_products_json = ${JSON.stringify(matches)}, updated_at = now() WHERE id = ${customerId}`
    return { ok: true, matches }
  } catch (err: any) {
    return { ok: false, matches: [], error: err?.message || 'Matching failed' }
  }
}
