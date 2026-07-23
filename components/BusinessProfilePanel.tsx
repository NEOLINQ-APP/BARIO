'use client'

export default function BusinessProfilePanel({
  onClose,
  businessName,
  setBusinessName,
  businessCategory,
  setBusinessCategory,
  businessHours,
  setBusinessHours,
  businessLocation,
  setBusinessLocation,
  onSave,
}: {
  onClose: () => void
  businessName: string
  setBusinessName: (v: string) => void
  businessCategory: string
  setBusinessCategory: (v: string) => void
  businessHours: string
  setBusinessHours: (v: string) => void
  businessLocation: string
  setBusinessLocation: (v: string) => void
  onSave: () => void | Promise<void>
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#131b2a] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">Business profile</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Tell Zeus about your business once — it'll use this automatically every time you ask for something, so you
          don't have to repeat it.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Business name</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Riverside Coffee Roasters"
              className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Category</label>
            <input
              value={businessCategory}
              onChange={(e) => setBusinessCategory(e.target.value)}
              placeholder="e.g. Coffee shop & roastery"
              className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Location</label>
            <input
              value={businessLocation}
              onChange={(e) => setBusinessLocation(e.target.value)}
              placeholder="e.g. Edmonton, AB"
              className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Hours</label>
            <input
              value={businessHours}
              onChange={(e) => setBusinessHours(e.target.value)}
              placeholder="e.g. Mon–Fri 7am–5pm, Sat–Sun 8am–3pm"
              className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
            />
          </div>
        </div>

        <button
          onClick={onSave}
          className="w-full mt-5 px-4 py-2 rounded-xl bg-[#f59e0b] text-[#1a1200] text-sm font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  )
}
