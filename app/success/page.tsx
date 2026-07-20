export const metadata = {
  title: 'You’re in — Bario',
}

export default function Success() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold">You're all set 🎉</h1>
        <p className="mt-4 text-zinc-300">
          Thanks for subscribing to Bario. A receipt is on its way to your email.
          We'll follow up shortly with next steps to get your site live.
        </p>
        <a href="/" className="inline-block mt-8 px-5 py-3 rounded-xl border border-zinc-700 text-zinc-200">
          Back to bario.ca
        </a>
      </div>
    </main>
  )
}
