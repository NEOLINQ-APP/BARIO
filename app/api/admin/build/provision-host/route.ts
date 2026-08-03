import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createSSHKey, findSSHKeyByName, createServer, setReverseDns, listServers, listServerTypesWithLocations, deleteServer } from '@/lib/hetzner'

// Diagnostic only: GET ?location=ash lists which server types Hetzner
// actually offers there, since availability varies by region and guessing
// wastes a failed provisioning call.
export async function GET(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes
  const url = new URL(req.url)
  const location = url.searchParams.get('location')
  const types = await listServerTypesWithLocations()
  const filtered = location ? types.filter((t) => t.locations.includes(location) && !t.deprecated) : types
  return NextResponse.json({ types: filtered })
}

// One-off infra provisioning route — NOT part of the customer-facing VPS
// product (lib/vpsProvision.ts / vps_instances). This creates the single
// dedicated Hetzner host that runs Bario Build's sandbox containers,
// deliberately isolated from the main production VPS (2.25.139.207, which
// runs Twenty CRM/n8n/code-server) per the Bario Build plan's security
// section — a sandbox escape here can't reach those trusted services.
//
// Idempotent via the bario_role label: calling this twice returns the
// already-provisioned host instead of creating a second one.
const SANDBOX_HOST_LABEL_SELECTOR = 'bario_role=sandbox-host'

const SANDBOX_HOST_SSH_PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIlNTLKY2LBYxDQx5y5dyuZKMw3kNlKaq1+zoQBXuxTE bario-sandbox-host'

export async function POST(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes

  try {
    const body = await req.json().catch(() => ({}))
    const location = typeof body?.location === 'string' ? body.location : 'nbg1'
    const hostname = typeof body?.hostname === 'string' ? body.hostname : 'sandbox-host-1.bario.ca'
    // Region-migration escape hatch: the label-based idempotency check only
    // applies to the default nbg1 host — passing a different location is a
    // deliberate second host (e.g. the Ashburn migration target), not an
    // accidental duplicate.
    if (location === 'nbg1') {
      const existing = await listServers(SANDBOX_HOST_LABEL_SELECTOR)
      if (existing.length > 0) {
        const s = existing[0]
        return NextResponse.json({
          alreadyExists: true,
          id: s.id,
          name: s.name,
          ipv4: s.public_net.ipv4?.ip ?? null,
          status: s.status,
        })
      }
    }

    const sshKey = (await findSSHKeyByName('bario-sandbox-host')) ?? (await createSSHKey('bario-sandbox-host', SANDBOX_HOST_SSH_PUBLIC_KEY))

    const server = await createServer({
      name: hostname,
      serverType: typeof body?.serverType === 'string' ? body.serverType : 'cx33', // 4 vCPU / 8GB RAM — matches VPS_TIERS.medium sizing
      location,
      sshKeyIds: [sshKey.id],
      userData: '#cloud-config\npackage_update: true\npackage_upgrade: true\n',
      enableBackups: false,
      labels: { bario_managed: 'true', bario_role: 'sandbox-host' },
    })

    if (server.ipv4) {
      await setReverseDns(String(server.id), server.ipv4, hostname)
    }

    return NextResponse.json({
      alreadyExists: false,
      id: server.id,
      ipv4: server.ipv4,
      ipv6: server.ipv6,
      status: server.status,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Provisioning failed' }, { status: 500 })
  }
}

// Decommissions an old sandbox host by Hetzner server id — used once the
// region migration to a new host is verified live, to stop paying for the
// leftover box.
export async function DELETE(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await deleteServer(id)
  return NextResponse.json({ ok: true })
}
