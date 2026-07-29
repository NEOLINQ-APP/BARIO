export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800/80 py-10 text-center text-sm text-slate-500 dark:text-slate-500">
      © 2026 bario.ca • hello@bario.ca<br />
      <a href="/terms" className="underline hover:text-slate-700 dark:hover:text-slate-300">Terms of Service</a>
      {' · '}
      <a href="/privacy" className="underline hover:text-slate-700 dark:hover:text-slate-300">Privacy Policy</a>
    </footer>
  )
}
