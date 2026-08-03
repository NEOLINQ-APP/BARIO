// Client for Bario Build's dedicated sandbox host (sandbox-host-1.bario.ca,
// 91.99.168.158) — a separate box running Docker + gVisor (runsc), not a
// Vercel deployment. Mirrors lib/hetzner.ts's/lib/runpod.ts's shape: an
// auth-header helper that throws early, one shared fetch wrapper, one
// exported function per operation. See the Bario Build plan
// (C:\Users\surew\.claude\plans\unified-wishing-salamander.md) for the full
// architecture and why this host is isolated from bario's main VPS.
//
// TLS gap, not silently glossed over: this specific internal hop (Vercel ->
// sandbox-host-api, port 4000) still talks plain HTTP — SANDBOX_HOST_URL is
// an http:// IP, no certificate, so the bearer token is visible to anything
// on-path. Customer-facing preview URLs (sess-*.sandbox.bario.ca) already
// moved to real HTTPS via a Let's Encrypt wildcard cert; this server-to-
// server leg is lower priority since it's not browser-facing, but is still
// a required item before real customer traffic — tracked as a phase-7
// hardening item in the plan, not forgotten.

function baseUrl() {
  const url = process.env.SANDBOX_HOST_URL
  if (!url) throw new Error('SANDBOX_HOST_URL is not set')
  return url
}

function authHeaders() {
  const token = process.env.SANDBOX_HOST_TOKEN
  if (!token) throw new Error('SANDBOX_HOST_TOKEN is not set')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function sandboxFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Sandbox host error (${res.status})`)
  return data
}

export async function createSandboxSession(sessionId: string): Promise<{ containerId: string; previewUrl: string }> {
  return sandboxFetch('/sessions', { method: 'POST', body: JSON.stringify({ sessionId }) })
}

export async function writeSandboxFile(sessionId: string, path: string, content: string): Promise<void> {
  await sandboxFetch(`/sessions/${sessionId}/files`, { method: 'POST', body: JSON.stringify({ path, content }) })
}

export async function execInSandbox(
  sessionId: string,
  command: string,
  opts?: { detached?: boolean }
): Promise<{ output: string; exitCode: number } | { started: true }> {
  return sandboxFetch(`/sessions/${sessionId}/exec`, {
    method: 'POST',
    body: JSON.stringify({ command, detached: opts?.detached ?? false }),
  })
}

export async function destroySandboxSession(sessionId: string): Promise<void> {
  await sandboxFetch(`/sessions/${sessionId}`, { method: 'DELETE' })
}

// Verifies a session the DB thinks is 'running' actually still has a live
// container backing it — a session can go stale without the DB ever
// hearing about it (manual cleanup on the host, a crash, a host restart).
// Never throws: any failure just means "not alive," which is the same
// signal as a genuine health-check failure.
export async function isSandboxSessionAlive(sessionId: string): Promise<boolean> {
  try {
    const data = await sandboxFetch(`/sessions/${sessionId}/health`)
    return data?.alive === true
  } catch {
    return false
  }
}
