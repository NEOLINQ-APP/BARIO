import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { nextBoInvoiceNumber, newPublicToken, computeTotals } from '@/lib/barioOneInvoices'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import { ensureDefaultPipeline } from '@/lib/barioOnePipelines'
import type { BoOrganization, BoInvoice, BoInvoiceItem } from '@/lib/db'

// Kill switch for find_new_leads, off on purpose as of 2026-08-18 — see
// the comment at that tool's case below for why. Flip to true once the
// real per-tier lead quota (part of the not-yet-live pricing update) is
// actually wired in.
const LEAD_GEN_LIVE = false

function invoiceTotalCents(invoice: BoInvoice, items: BoInvoiceItem[]): number {
  return computeTotals(
    items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unit_price_cents })),
    Number(invoice.tax_percent),
    { type: invoice.discount_type, value: Number(invoice.discount_value) }
  ).totalCents
}

// Bario AI's tool list — same safety principle as the platform's own
// admin assistant (lib/adminAssistantTools.ts): the tool list itself is
// the real security boundary, not a prompt instruction. Nothing here can
// send money, mark something paid, delete data, or process a refund —
// those simply don't exist as callable functions. The two write actions
// (create_invoice, schedule_shift) mirror the exact two write-capable
// example prompts in the approved spec ("Create an invoice for John
// Smith", "Schedule employees next week"), both scoped to creating new
// draft/pending records only, never modifying money already in motion.

export const BARIO_ONE_ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'who_owes_money',
      description: 'List customers with unpaid (sent or overdue) invoices, with amounts and due dates.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'sales_this_month',
      description: 'Get total POS sales and invoice payments received so far this calendar month.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_top_customers',
      description: 'Find the top customers by total revenue (paid invoices + POS sales).',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'How many to return, default 5' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_low_stock_products',
      description: 'List products at or below their low-stock threshold.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_invoice',
      description: 'Create a new DRAFT invoice for a customer (matched by name). Never sends or charges it — the business still reviews and sends it themselves.',
      parameters: {
        type: 'object',
        properties: {
          customerName: { type: 'string', description: "The customer's name or company name — matched fuzzily against existing customers" },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unitPriceDollars: { type: 'number' },
              },
              required: ['description', 'quantity', 'unitPriceDollars'],
            },
          },
          notes: { type: 'string' },
        },
        required: ['customerName', 'lineItems'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'schedule_shift',
      description: 'Schedule a work shift for an employee (matched by name).',
      parameters: {
        type: 'object',
        properties: {
          employeeName: { type: 'string' },
          startsAt: { type: 'string', description: 'ISO 8601 datetime for shift start' },
          endsAt: { type: 'string', description: 'ISO 8601 datetime for shift end' },
        },
        required: ['employeeName', 'startsAt', 'endsAt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_new_leads',
      description: 'Research the real web for new potential customers matching what the business asked for, and add each one to the CRM as a new lead (a customer record + a deal in the Leads stage). Use this whenever they ask to find leads, prospects, or new customers — e.g. "find me some HVAC contractors in Calgary".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What kind of leads to find — industry, location, and any other criteria, in the user’s own words' },
          count: { type: 'number', description: 'How many leads to find, default 5, max 10' },
        },
        required: ['query'],
      },
    },
  },
]

async function findCustomerByName(sql: any, orgId: string, name: string) {
  const rows = (await sql`
    SELECT * FROM bo_customers
    WHERE organization_id = ${orgId} AND (contact_name ILIKE ${'%' + name + '%'} OR company_name ILIKE ${'%' + name + '%'})
    LIMIT 1
  `) as unknown as { id: string; contact_name: string; company_name: string | null }[]
  return rows[0] ?? null
}

async function findEmployeeByName(sql: any, orgId: string, name: string) {
  const rows = (await sql`SELECT * FROM bo_employees WHERE organization_id = ${orgId} AND name ILIKE ${'%' + name + '%'} LIMIT 1`) as unknown as { id: string; name: string }[]
  return rows[0] ?? null
}

export async function executeBarioOneAssistantTool(sql: any, org: BoOrganization, name: string, args: any): Promise<unknown> {
  switch (name) {
    case 'who_owes_money': {
      const invoices = (await sql`
        SELECT i.*, c.contact_name, c.company_name FROM bo_invoices i
        JOIN bo_customers c ON c.id = i.customer_id
        WHERE i.organization_id = ${org.id} AND i.type = 'invoice' AND i.status IN ('sent', 'overdue')
        ORDER BY i.due_date ASC NULLS LAST
      `) as unknown as (BoInvoice & { contact_name: string; company_name: string | null })[]

      const results = []
      for (const inv of invoices) {
        const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${inv.id}`) as unknown as BoInvoiceItem[]
        results.push({
          customer: inv.company_name || inv.contact_name,
          invoiceNumber: inv.number,
          amountOwedCents: invoiceTotalCents(inv, items),
          dueDate: inv.due_date,
          status: inv.status,
        })
      }
      return { invoices: results }
    }
    case 'sales_this_month': {
      const posRows = (await sql`
        SELECT COALESCE(SUM(total_cents), 0)::bigint as total_cents, COUNT(*)::int as count
        FROM bo_pos_sales WHERE organization_id = ${org.id} AND status = 'completed' AND created_at >= date_trunc('month', now())
      `) as unknown as { total_cents: number; count: number }[]

      const paidInvoices = (await sql`
        SELECT * FROM bo_invoices WHERE organization_id = ${org.id} AND status = 'paid' AND paid_at >= date_trunc('month', now())
      `) as unknown as BoInvoice[]
      let invoicesPaidCents = 0
      for (const inv of paidInvoices) {
        const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${inv.id}`) as unknown as BoInvoiceItem[]
        invoicesPaidCents += invoiceTotalCents(inv, items)
      }

      return {
        posSalesCents: Number(posRows[0]?.total_cents ?? 0),
        posSalesCount: posRows[0]?.count ?? 0,
        invoicesPaidCents,
      }
    }
    case 'find_top_customers': {
      const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Math.round(args.limit), 1), 20) : 5

      const customers = (await sql`SELECT * FROM bo_customers WHERE organization_id = ${org.id}`) as unknown as { id: string; contact_name: string; company_name: string | null }[]
      const posTotals = (await sql`
        SELECT customer_id, SUM(total_cents)::bigint as total FROM bo_pos_sales
        WHERE organization_id = ${org.id} AND status = 'completed' AND customer_id IS NOT NULL
        GROUP BY customer_id
      `) as unknown as { customer_id: string; total: number }[]
      const posMap = new Map(posTotals.map((r) => [r.customer_id, Number(r.total)]))

      const paidInvoices = (await sql`SELECT * FROM bo_invoices WHERE organization_id = ${org.id} AND status = 'paid'`) as unknown as BoInvoice[]
      const invoiceRevenueByCustomer = new Map<string, number>()
      for (const inv of paidInvoices) {
        const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${inv.id}`) as unknown as BoInvoiceItem[]
        invoiceRevenueByCustomer.set(inv.customer_id, (invoiceRevenueByCustomer.get(inv.customer_id) ?? 0) + invoiceTotalCents(inv, items))
      }

      const ranked = customers
        .map((c) => ({
          customer: c.company_name || c.contact_name,
          revenueCents: (posMap.get(c.id) ?? 0) + (invoiceRevenueByCustomer.get(c.id) ?? 0),
        }))
        .filter((c) => c.revenueCents > 0)
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, limit)

      return { customers: ranked }
    }
    case 'list_low_stock_products': {
      const rows = await sql`
        SELECT name, sku, stock_quantity, low_stock_threshold FROM bo_products
        WHERE organization_id = ${org.id} AND stock_quantity <= low_stock_threshold AND status = 'active'
        ORDER BY stock_quantity ASC
      `
      return { products: rows }
    }
    case 'create_invoice': {
      const customer = await findCustomerByName(sql, org.id, String(args.customerName || ''))
      if (!customer) return { error: `No customer found matching "${args.customerName}"` }
      const items = Array.isArray(args.lineItems) ? args.lineItems : []
      if (items.length === 0) return { error: 'At least one line item is required' }

      const id = randomUUID()
      const number = await nextBoInvoiceNumber(sql, org.id, 'invoice')
      const publicToken = newPublicToken()
      await sql`
        INSERT INTO bo_invoices (id, organization_id, customer_id, type, number, public_token, notes)
        VALUES (${id}, ${org.id}, ${customer.id}, 'invoice', ${number}, ${publicToken}, ${args.notes || null})
      `
      let sortOrder = 0
      for (const item of items) {
        await sql`
          INSERT INTO bo_invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order)
          VALUES (${randomUUID()}, ${id}, ${String(item.description).slice(0, 200)}, ${Number(item.quantity) || 1}, ${Math.round((Number(item.unitPriceDollars) || 0) * 100)}, ${sortOrder++})
        `
      }
      await triggerWebhooks(sql, org.id, 'invoice.created', { invoiceId: id, number, customerId: customer.id })
      return { ok: true, invoiceId: id, invoiceNumber: number, customer: customer.company_name || customer.contact_name }
    }
    case 'schedule_shift': {
      const employee = await findEmployeeByName(sql, org.id, String(args.employeeName || ''))
      if (!employee) return { error: `No employee found matching "${args.employeeName}"` }
      if (!args.startsAt || !args.endsAt) return { error: 'startsAt and endsAt are required' }
      if (new Date(args.endsAt) <= new Date(args.startsAt)) return { error: 'End time must be after start time' }

      const shiftId = randomUUID()
      await sql`
        INSERT INTO bo_shifts (id, organization_id, employee_id, starts_at, ends_at)
        VALUES (${shiftId}, ${org.id}, ${employee.id}, ${args.startsAt}, ${args.endsAt})
      `
      await triggerWebhooks(sql, org.id, 'shift.scheduled', { shiftId, employeeId: employee.id, startsAt: args.startsAt, endsAt: args.endsAt })
      return { ok: true, employee: employee.name, startsAt: args.startsAt, endsAt: args.endsAt }
    }
    case 'find_new_leads': {
      // Deliberately held off 2026-08-18, on request — this was shipped
      // with no usage cap beyond a per-call max of 10, but the real plan
      // is a per-tier monthly lead quota (Starter/Professional/Business
      // each get a different amount) as part of the pricing update, which
      // isn't defined or live on the pricing page yet. Don't let this
      // start spending real Anthropic/web-search cost for free ahead of
      // that. Remove this early-return (not the tool itself) once pricing
      // is live and the actual per-tier quota is wired in below it.
      if (!LEAD_GEN_LIVE) {
        return { error: "Lead generation isn't turned on yet — it's launching soon with real pricing tiers. Let the user know it's coming." }
      }
      const query = String(args.query || '').trim()
      if (!query) return { error: 'query is required — describe what kind of leads to find' }
      const count = Number.isFinite(args.count) ? Math.min(Math.max(Math.round(args.count), 1), 10) : 5

      const leads = await researchLeads(query, count)
      if (leads.length === 0) return { error: 'Could not find any real leads matching that — try a broader or more specific search.' }

      const pipeline = await ensureDefaultPipeline(sql, org.id)
      const added: { customer: string; dealId: string }[] = []
      for (const lead of leads) {
        if (!lead.companyName && !lead.contactName) continue
        const customerId = randomUUID()
        await sql`
          INSERT INTO bo_customers (id, organization_id, company_name, contact_name, phone, email, tags_json, created_by_user_id)
          VALUES (${customerId}, ${org.id}, ${lead.companyName || null}, ${lead.contactName || lead.companyName}, ${lead.phone || null}, ${lead.email || null}, '["lead"]', NULL)
        `
        const dealId = randomUUID()
        await sql`
          INSERT INTO bo_deals (id, organization_id, customer_id, pipeline_id, title, stage, notes)
          VALUES (${dealId}, ${org.id}, ${customerId}, ${pipeline.id}, ${`New lead — ${lead.companyName || lead.contactName}`}, 'lead', ${lead.reason || null})
        `
        added.push({ customer: (lead.companyName || lead.contactName) as string, dealId })
      }
      return { ok: true, addedCount: added.length, leads: added.map((a) => a.customer) }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

type ResearchedLead = {
  companyName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  reason: string | null
}

// Uses Claude's own hosted web_search tool (real, live search — not a
// guess) to research actual businesses matching the query, since neither
// OpenAI's chat.completions API (what the rest of this assistant runs on)
// nor this codebase has a working web-search path on that provider yet.
// Returns [] on any failure — a research miss should surface as "found
// nothing," never a thrown error the chat loop has to handle specially.
async function researchLeads(query: string, count: number): Promise<ResearchedLead[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []
  const anthropic = new Anthropic({ apiKey })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, allowed_callers: ['direct'] }],
      system:
        'You research real, currently-operating businesses on the web for B2B sales prospecting. Only return businesses you actually found via search — never invent one. After searching, respond with ONLY a raw JSON array (no markdown fences, no prose) of objects shaped exactly like: {"companyName": string|null, "contactName": string|null, "phone": string|null, "email": string|null, "reason": string} — reason is one short sentence on why this business is a good fit for the query. Omit phone/email as null if you could not find a real one — never invent contact details.',
      messages: [{ role: 'user', content: `Find ${count} real businesses matching: ${query}` }],
    })

    const textBlock = response.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n')
    const jsonMatch = textBlock.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((r: any) => r && (r.companyName || r.contactName))
      .slice(0, count)
      .map((r: any) => ({
        companyName: typeof r.companyName === 'string' ? r.companyName.slice(0, 200) : null,
        contactName: typeof r.contactName === 'string' ? r.contactName.slice(0, 200) : null,
        phone: typeof r.phone === 'string' ? r.phone.slice(0, 40) : null,
        email: typeof r.email === 'string' ? r.email.slice(0, 200) : null,
        reason: typeof r.reason === 'string' ? r.reason.slice(0, 500) : null,
      }))
  } catch (err) {
    console.error('researchLeads failed', err)
    return []
  }
}
