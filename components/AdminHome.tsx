export default function AdminHome() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-zinc-400 mt-1">Manage templates, marketing, and gift codes.</p>

        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <a href="/admin/templates" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Templates</div>
            <p className="text-xs text-zinc-400 mt-2">Add or remove the free templates available to every subscriber.</p>
          </a>
          <a href="/admin/storage" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Storage</div>
            <p className="text-xs text-zinc-400 mt-2">Shared file storage — folders of images, videos, and other assets.</p>
          </a>
          <a href="/admin/marketing" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Marketing Posts</div>
            <p className="text-xs text-zinc-400 mt-2">Generate and approve AI-drafted social/marketing posts.</p>
          </a>
          <a href="/admin/gift-codes" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Gift & Promo Codes</div>
            <p className="text-xs text-zinc-400 mt-2">Create codes that grant users free AI-builder credits.</p>
          </a>
          <a href="/admin/users" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Grant a Plan</div>
            <p className="text-xs text-zinc-400 mt-2">Comp a paid plan onto an account — no payment, e.g. for family.</p>
          </a>
          <a href="/admin/assistant" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Assistant</div>
            <p className="text-xs text-zinc-400 mt-2">General-purpose AI that can also fix low-risk account issues on its own.</p>
          </a>
          <a href="/admin/crm-outreach" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">CRM Outreach</div>
            <p className="text-xs text-zinc-400 mt-2">Review and send AI-drafted outreach emails for AFC Logistics / Sunbuilt Group.</p>
          </a>
          <a href="/admin/collections" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Payment Collections</div>
            <p className="text-xs text-zinc-400 mt-2">3-strike reminder/lockout flow for sites live before payment is received.</p>
          </a>
          <a href="/admin/costs" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Reseller Costs & Margin</div>
            <p className="text-xs text-zinc-400 mt-2">Real Hetzner VPS cost vs. what's charged, so you know how much discount room exists.</p>
          </a>
          <a href="/admin/coupons" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Coupons & Promoter Links</div>
            <p className="text-xs text-zinc-400 mt-2">Create discount codes with a shareable auto-apply link for influencers/promoters.</p>
          </a>
        </div>
      </div>
    </main>
  )
}
