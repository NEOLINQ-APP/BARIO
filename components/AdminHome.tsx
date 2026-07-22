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
          <a href="/admin/marketing" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Marketing Posts</div>
            <p className="text-xs text-zinc-400 mt-2">Generate and approve AI-drafted social/marketing posts.</p>
          </a>
          <a href="/admin/gift-codes" className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 hover:border-zinc-600 transition-colors">
            <div className="font-semibold">Gift & Promo Codes</div>
            <p className="text-xs text-zinc-400 mt-2">Create codes that grant users free AI-builder credits.</p>
          </a>
        </div>
      </div>
    </main>
  )
}
