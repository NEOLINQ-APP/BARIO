import { Suspense } from 'react'
import BackupOfferForm from '@/components/BackupOfferForm'

export default function OnboardingBackup() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <BackupOfferForm />
      </Suspense>
    </main>
  )
}
