import BarioOneSecondaryNav from '@/components/BarioOneSecondaryNav'

// Business OS Phase 1 — didn't exist before; the correct additive spot to
// mount the new secondary nav for everything under /dashboard/bario-one/*
// without touching app/(account)/layout.tsx or components/AccountSidebar.tsx
// (the account-wide sidebar) at all. No padding here on purpose — every
// existing page under this segment already wraps itself in its own
// <main className="px-6 py-10..."> (confirmed via page.tsx), so adding
// padding at this layout level would double it up on every one of them.
export default function BarioOneLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-full">
      <BarioOneSecondaryNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
