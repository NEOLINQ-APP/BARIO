import { redirect } from 'next/navigation'

// Merged into NEO 2026-08-19 — this was a separate agent (general Q&A +
// low-risk account fixes) with no automated monitoring of its own; NEO now
// covers both (the same chat + tools, plus the health-check/approval
// queue). Redirect rather than delete the route outright in case anything
// still links here.
export default function AdminAssistantPage() {
  redirect('/admin/neo')
}
