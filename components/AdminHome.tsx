import ThemeToggle from '@/components/ThemeToggle'

export default function AdminHome() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Manage templates, marketing, and gift codes.</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <a href="/admin/templates" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Templates</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Add or remove the free templates available to every subscriber.</p>
          </a>
          <a href="/admin/storage" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Storage</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Shared file storage — folders of images, videos, and other assets.</p>
          </a>
          <a href="/admin/marketing" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Marketing Posts</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Generate and approve AI-drafted social/marketing posts.</p>
          </a>
          <a href="/admin/gift-codes" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Gift & Promo Codes</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Create codes that grant users free AI-builder credits.</p>
          </a>
          <a href="/admin/users" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Grant a Plan</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Comp a paid plan onto an account — no payment, e.g. for family.</p>
          </a>
          <a href="/admin/assistant" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Assistant</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">General-purpose AI that can also fix low-risk account issues on its own.</p>
          </a>
          <a href="/admin/crm-outreach" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">CRM Outreach</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Review and send AI-drafted outreach emails for AFC Logistics / Sunbuilt Group.</p>
          </a>
          <a href="/admin/site-audit-leads" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Site Audit Leads 🎯</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Every account created through the free site-audit funnel — email, site audited, score, CSV export.</p>
          </a>
          <a href="/admin/dialer" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Bario Dialer 📞</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Installable per-business apps — real calls as AFC Logistics, Sunbuilt Group, or Unique Group Inc. Separate installable link per business: /admin/dialer/afc, /sunbuilt, /unique.</p>
          </a>
          <a href="/admin/requests" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Client Requests 📋</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">AFC Logistics / Sunbuilt Group request queue — AI-estimated ETAs, status, and the full comment log.</p>
          </a>
          <a href="/admin/collections" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Payment Collections</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">3-strike reminder/lockout flow for sites live before payment is received.</p>
          </a>
          <a href="/admin/costs" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Reseller Costs & Margin</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Real Hetzner VPS cost vs. what's charged, so you know how much discount room exists.</p>
          </a>
          <a href="/admin/coupons" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Coupons & Promoter Links</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Create discount codes with a shareable auto-apply link for influencers/promoters.</p>
          </a>
          <a href="/admin/sales" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Sales & Records</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Every completed sale across all products, live from Stripe — what sold, to whom, and when.</p>
          </a>
          <a href="/admin/invoices" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Quotes & Invoices</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Manually build a quote or invoice from real product prices, with a custom discount, a shareable link, and a real Pay Now button.</p>
          </a>
          <a href="/admin/agents" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Agents</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Every AI agent (Victoria, Miko, Amber), their real responsibilities, and their task list — nothing gets duplicated.</p>
          </a>
          <a href="/admin/payroll" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Payroll</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Staff roster and paystubs — real CPP/CPP2/EI + federal tax; Alberta provincial tax verified, other provinces flagged for review.</p>
          </a>
          <a href="/admin/victoria" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Victoria Call Log</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Real per-call cost across all three business lines — actual token usage + Twilio rates on real call duration.</p>
          </a>
          <a href="/admin/voice-agent" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Voice Agent Orders 📞</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Customer-ordered AI phone answering — review paid orders, assign a real Twilio number, hit Build to activate.</p>
          </a>
          <a href="/admin/client-crms" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Client CRMs 🔑</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Every Twenty CRM workspace provisioned for a client — open it directly or reveal its login, no digging for credentials.</p>
          </a>
          <a href="/admin/bario-one-mailboxes" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Bario One Mailboxes 📧</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Set up each Bario One CRM's real two-way email — auto-provision on Bario's Mailcow, or connect a mailbox they already own.</p>
          </a>
          <a href="/admin/users" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">All Users 👥</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Every account signed up on bario.ca — search, upgrade a plan, suspend, or delete.</p>
          </a>
          <a href="/admin/ai-integrations" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors">
            <div className="font-semibold">AI Integrations & Domains</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Every place Bario calls an AI model, which provider/model, and which domain(s) it serves.</p>
          </a>
        </div>
      </div>
    </main>
  )
}
