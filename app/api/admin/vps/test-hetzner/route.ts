import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServer, getServer, setReverseDns, deleteServer, listServerTypes } from '@/lib/hetzner'
import { buildUserData } from '@/lib/cloudInit'
import { encryptPassword, decryptPassword } from '@/lib/vpsPassword'
import { VPS_REGION } from '@/lib/vpsTiers'

// Phase-1 verification tool per the VPS integration plan: creates one real
// Hetzner server (password-fallback path, exercising encryptPassword's
// round-trip too, since that needs no SSH key generation to test), sets its
// reverse DNS, confirms it's reachable via getServer, then deletes it.
// Admin-only (Bearer or session) — kept as a standing diagnostic for the
// Hetzner integration rather than a true one-shot throwaway, same as other
// admin utility routes in this app.
export const maxDuration = 60

// Diagnostic-only: lists Hetzner's current non-deprecated server types, so
// lib/vpsTiers.ts's hetznerServerType slugs can be picked/kept up to date
// against Hetzner's actual catalog rather than assumed.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const types = await listServerTypes()
    return NextResponse.json({ ok: true, types: types.filter((t) => !t.deprecated) })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const steps: any[] = []
  let serverId: string | null = null

  try {
    const hostname = `test-${Date.now()}.vps.bario.ca`

    const server = await createServer({
      name: hostname,
      serverType: 'cx23',
      location: VPS_REGION,
      sshKeyIds: [],
      userData: buildUserData({ hostname }),
      enableBackups: false,
      labels: { bario_test: 'true' },
    })
    serverId = String(server.id)
    steps.push({ step: 'createServer', ok: true, serverId, ipv4: server.ipv4, status: server.status, hasPassword: !!server.rootPassword })

    if (server.rootPassword) {
      const enc = encryptPassword(server.rootPassword)
      const dec = decryptPassword(enc.ciphertext, enc.iv)
      steps.push({ step: 'passwordRoundTrip', ok: dec === server.rootPassword })
    }

    if (server.ipv4) {
      await setReverseDns(serverId, server.ipv4, hostname)
      steps.push({ step: 'setReverseDns', ok: true, hostname })
    }

    const fetched = await getServer(serverId)
    steps.push({ step: 'getServer', ok: true, status: fetched.status })

    await deleteServer(serverId)
    steps.push({ step: 'deleteServer', ok: true })

    return NextResponse.json({ ok: true, steps })
  } catch (err: any) {
    if (serverId) {
      try {
        await deleteServer(serverId)
        steps.push({ step: 'cleanupAfterFailure', ok: true })
      } catch {}
    }
    return NextResponse.json({ ok: false, error: err.message, steps }, { status: 500 })
  }
}
