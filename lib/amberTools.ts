import { randomUUID } from 'node:crypto'
import { getFullCatalog } from '@/lib/invoiceCatalog'
import { computeTotals } from '@/lib/invoices'

// Amber — the finance-department assistant for quotes/invoices. Read tools
// (search/get/catalog) execute immediately; anything that would create or
// change an invoice or its prices only ever inserts a pending
// invoice_change_requests row — never touches the real invoice. Applying a
// proposal requires an explicit admin approve/reject
// (app/api/admin/invoices/change-requests/[id]), which is what actually
// creates/updates the invoice and records who approved it and when. This
// mirrors the same "financial changes always need human review" boundary
// already established for the general admin assistant
// (lib/adminAssistantTools.ts) — Amber simply has no tool that writes to
// invoices directly, so there's no path (including prompt injection via
// invoice/client text) to bypass the approval step.

export const AMBER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_invoices',
      description: 'Search existing quotes/invoices by client name, invoice number, or status.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Client name, invoice number, or status (draft/sent/paid/void) to search for' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_invoice',
      description: 'Get full details (line items, totals) for one invoice by its number (e.g. INV-1000) or id.',
      parameters: {
        type: 'object',
        properties: { numberOrId: { type: 'string' } },
        required: ['numberOrId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_product_catalog',
      description: 'List real Bario products and current prices (hosting plans, VPS tiers, X-Drive storage, templates) to use as line items.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_new_invoice',
      description: "Propose creating a new quote/invoice. This does NOT create it — it submits the proposal for Mr. Mendoza's approval, recorded with a timestamp once he decides.",
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['invoice', 'quote'] },
          clientName: { type: 'string' },
          clientEmail: { type: 'string' },
          clientPhone: { type: 'string' },
          currency: { type: 'string', description: 'Defaults to CAD' },
          taxPercent: { type: 'number' },
          discountType: { type: 'string', enum: ['none', 'percent', 'fixed'] },
          discountValue: { type: 'number', description: 'Percent (0-100) if discountType is percent, cents if fixed' },
          notes: { type: 'string' },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unitPriceCents: { type: 'number' },
              },
              required: ['description', 'quantity', 'unitPriceCents'],
            },
          },
        },
        required: ['clientName', 'lineItems'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_invoice_update',
      description: "Propose a change to an existing invoice/quote (price, line items, discount, client info, etc). This does NOT apply the change — it submits it for Mr. Mendoza's approval.",
      parameters: {
        type: 'object',
        properties: {
          numberOrId: { type: 'string' },
          summary: { type: 'string', description: 'One-sentence plain-language description of what is changing and why' },
          changes: {
            type: 'object',
            description: 'Only the fields being changed — same shape as propose_new_invoice minus type/lineItems requirement',
          },
        },
        required: ['numberOrId', 'summary', 'changes'],
      },
    },
  },
]

async function resolveInvoice(sql: any, numberOrId: string) {
  const rows = (await sql`SELECT * FROM invoices WHERE number = ${numberOrId} OR id = ${numberOrId}`) as unknown as any[]
  return rows[0] ?? null
}

export async function executeAmberTool(sql: any, name: string, args: any): Promise<unknown> {
  switch (name) {
    case 'search_invoices': {
      const q = `%${String(args.query ?? '').trim()}%`
      const rows = await sql`
        SELECT number, type, status, client_name, currency FROM invoices
        WHERE client_name ILIKE ${q} OR number ILIKE ${q} OR status ILIKE ${q}
        ORDER BY created_at DESC LIMIT 15
      `
      return { results: rows }
    }
    case 'get_invoice': {
      const invoice = await resolveInvoice(sql, args.numberOrId)
      if (!invoice) return { error: 'Not found' }
      const lineItems = (await sql`SELECT description, quantity, unit_price_cents FROM invoice_line_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as any[]
      const totals = computeTotals(
        lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
        Number(invoice.tax_percent),
        { type: invoice.discount_type, value: Number(invoice.discount_value) }
      )
      return { invoice, lineItems, totals }
    }
    case 'get_product_catalog': {
      const catalog = await getFullCatalog(sql)
      return { catalog }
    }
    case 'propose_new_invoice': {
      const id = randomUUID()
      const summary = `New ${args.type === 'quote' ? 'quote' : 'invoice'} for ${args.clientName} — ${(args.lineItems ?? []).length} line item(s)`
      await sql`
        INSERT INTO invoice_change_requests (id, invoice_id, agent_name, change_type, summary, payload_json, status)
        VALUES (${id}, NULL, 'amber', 'create', ${summary}, ${JSON.stringify(args)}, 'pending')
      `
      return { ok: true, changeRequestId: id, message: "Submitted for Mr. Mendoza's approval — not yet created." }
    }
    case 'propose_invoice_update': {
      const invoice = await resolveInvoice(sql, args.numberOrId)
      if (!invoice) return { error: 'Not found' }
      const id = randomUUID()
      await sql`
        INSERT INTO invoice_change_requests (id, invoice_id, agent_name, change_type, summary, payload_json, status)
        VALUES (${id}, ${invoice.id}, 'amber', 'update', ${args.summary}, ${JSON.stringify(args.changes)}, 'pending')
      `
      return { ok: true, changeRequestId: id, message: "Submitted for Mr. Mendoza's approval — not yet applied." }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}
