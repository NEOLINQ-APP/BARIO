// Mirrors lib/hetzner.ts's structure (auth-header helper that throws early,
// one shared fetch wrapper, one exported function per operation). This talks
// to a single RunPod Serverless endpoint that runs Bario's own worker image
// (ComfyUI + Wan 2.2 for video, Kokoro for voiceover) — see the approved
// Studio plan for why this replaces a pay-per-call vendor API (fal.ai/
// ElevenLabs) with self-hosted, open-source models on rented GPU compute.
//
// RunPod Serverless's async job API doesn't push webhooks the way Stripe
// does — /run just returns a job id, and the caller polls /status/:id. That
// polling happens in app/api/studio/status/[jobId]/route.ts (on-demand, when
// the client checks in) and in the studio-reconcile cron (as a safety net
// for jobs whose status was never re-checked because the user closed the tab).

const RUNPOD_API = 'https://api.runpod.ai/v2'

function endpointBase(): string {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID
  if (!endpointId) throw new Error('RUNPOD_ENDPOINT_ID is not set')
  return `${RUNPOD_API}/${endpointId}`
}

function authHeaders() {
  if (!process.env.RUNPOD_API_KEY) throw new Error('RUNPOD_API_KEY is not set')
  return { Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`, 'Content-Type': 'application/json' }
}

async function rpFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${endpointBase()}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error || `RunPod API error (${res.status})`
    throw new Error(msg)
  }
  return data
}

export type StudioJobInput =
  | { jobType: 'video'; prompt: string; sourceImageBase64?: string; durationSeconds: number }
  | { jobType: 'voiceover'; text: string; voiceId?: string }

export async function submitJob(input: StudioJobInput): Promise<{ requestId: string }> {
  const data = await rpFetch('/run', {
    method: 'POST',
    body: JSON.stringify({ input }),
  })
  return { requestId: data.id }
}

// Voiceover (Kokoro/XTTS) generation is fast enough to finish inside a
// single request, unlike video — RunPod's /runsync blocks and returns the
// completed result directly, so there's no job row or polling needed for
// this path (see app/api/studio/voiceover/route.ts).
export async function runSync(input: StudioJobInput): Promise<{ outputBase64: string; outputContentType: string | null }> {
  const data = await rpFetch('/runsync', {
    method: 'POST',
    body: JSON.stringify({ input }),
  })
  if (data.status !== 'COMPLETED') {
    throw new Error(data.error || `RunPod job ${String(data.status).toLowerCase()}`)
  }
  return { outputBase64: data.output?.data ?? '', outputContentType: data.output?.contentType ?? null }
}

export type RunPodJobStatus = {
  status: 'pending' | 'processing' | 'complete' | 'failed'
  // The worker returns the generated file as base64 rather than a URL — it
  // has no storage of its own, so BARIO re-uploads the bytes to Vercel Blob
  // (see app/api/studio/status/[jobId]/route.ts) once this comes back.
  outputBase64: string | null
  outputContentType: string | null
  error: string | null
}

// RunPod's own status strings (IN_QUEUE, IN_PROGRESS, COMPLETED, FAILED,
// CANCELLED) are normalized here to the same pending/processing/complete/
// failed vocabulary studio_jobs.status uses, so nothing downstream needs to
// know RunPod's specific naming.
export async function getJobStatus(requestId: string): Promise<RunPodJobStatus> {
  const data = await rpFetch(`/status/${requestId}`)
  const raw = data.status as string
  if (raw === 'COMPLETED') {
    return {
      status: 'complete',
      outputBase64: data.output?.data ?? null,
      outputContentType: data.output?.contentType ?? null,
      error: null,
    }
  }
  if (raw === 'FAILED' || raw === 'CANCELLED' || raw === 'TIMED_OUT') {
    return { status: 'failed', outputBase64: null, outputContentType: null, error: data.error ?? `RunPod job ${raw.toLowerCase()}` }
  }
  if (raw === 'IN_PROGRESS') {
    return { status: 'processing', outputBase64: null, outputContentType: null, error: null }
  }
  return { status: 'pending', outputBase64: null, outputContentType: null, error: null }
}
