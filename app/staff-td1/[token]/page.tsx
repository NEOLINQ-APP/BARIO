import { db } from '@/lib/db'
import StaffTd1Form from '@/components/StaffTd1Form'
import type { StaffTd1Record, Staff } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function StaffTd1Page({ params }: { params: { token: string } }) {
  const sql = await db()
  const rows = (await sql`SELECT * FROM staff_td1_records WHERE token = ${params.token}`) as unknown as StaffTd1Record[]
  const record = rows[0]

  if (!record) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 px-6">
        <p className="text-sm text-slate-500 dark:text-zinc-400">This link isn't valid. Please ask for a new one.</p>
      </main>
    )
  }

  const staffRows = (await sql`SELECT * FROM staff WHERE id = ${record.staff_id}`) as unknown as Staff[]
  const staff = staffRows[0]

  if (record.status === 'completed') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 px-6 text-center">
        <div>
          <p className="text-2xl mb-2">✅</p>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Thanks — your tax forms are already on file. No action needed.</p>
        </div>
      </main>
    )
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 px-6">
        <p className="text-sm text-slate-500 dark:text-zinc-400">This link has expired. Please ask for a new one.</p>
      </main>
    )
  }

  return <StaffTd1Form token={params.token} staffName={staff?.name ?? ''} province={record.province} />
}
