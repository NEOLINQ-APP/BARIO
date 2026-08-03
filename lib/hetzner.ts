// Mirrors lib/cloudflare.ts's structure (auth-header helper that throws
// early, one shared fetch wrapper normalizing errors, one exported function
// per operation). Hetzner's response envelope differs from Cloudflare's
// uniform {success,result} shape — each Hetzner endpoint wraps its payload
// under its own key (e.g. {server:...}, {servers:[...]}, {action:...}), so
// hzFetch returns the raw parsed body and each caller destructures the key
// it expects, rather than unwrapping a single common field like cfFetch does.

const HZ_API = 'https://api.hetzner.cloud/v1'

export type HetznerServer = {
  id: number
  name: string
  status: string // 'running' | 'off' | 'starting' | 'stopping' | 'initializing' | ...
  public_net: {
    ipv4: { ip: string } | null
    ipv6: { ip: string } | null
  }
  server_type: { name: string }
  labels: Record<string, string>
}

function authHeaders() {
  if (!process.env.HETZNER_API_TOKEN) throw new Error('HETZNER_API_TOKEN is not set')
  return { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}`, 'Content-Type': 'application/json' }
}

async function hzFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${HZ_API}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `Hetzner API error (${res.status})`
    throw new Error(msg)
  }
  return data
}

export async function listServerTypes(): Promise<{ name: string; cores: number; memory: number; disk: number; deprecated: boolean }[]> {
  const data = await hzFetch('/server_types')
  return data.server_types.map((t: any) => ({ name: t.name, cores: t.cores, memory: t.memory, disk: t.disk, deprecated: !!t.deprecated }))
}

// Server type availability genuinely varies by location (e.g. Hetzner's US
// locations don't offer every EU shared-vCPU type), and guessing wastes a
// failed provisioning call — this surfaces the real per-location pricing
// entries (each one names the location it's actually available in) so a
// caller can pick a real, valid combination first.
export async function listServerTypesWithLocations(): Promise<{ name: string; deprecated: boolean; locations: string[] }[]> {
  const data = await hzFetch('/server_types')
  return data.server_types.map((t: any) => ({
    name: t.name,
    deprecated: !!t.deprecated,
    locations: (t.prices ?? []).map((p: any) => p.location),
  }))
}

export async function createSSHKey(name: string, publicKey: string): Promise<{ id: number }> {
  const data = await hzFetch('/ssh_keys', {
    method: 'POST',
    body: JSON.stringify({ name, public_key: publicKey }),
  })
  return data.ssh_key
}

// Hetzner rejects re-uploading a key whose fingerprint already exists on the
// account — harmless in practice (each customer's key is uploaded once) but
// worth a lookup-first path if the same key is ever reused across orders.
export async function findSSHKeyByFingerprint(fingerprint: string): Promise<{ id: number } | null> {
  const data = await hzFetch(`/ssh_keys?fingerprint=${encodeURIComponent(fingerprint)}`)
  return data.ssh_keys?.[0] ?? null
}

export async function findSSHKeyByName(name: string): Promise<{ id: number } | null> {
  const data = await hzFetch(`/ssh_keys?name=${encodeURIComponent(name)}`)
  return data.ssh_keys?.[0] ?? null
}

export async function createServer(opts: {
  name: string
  serverType: string
  location: string
  sshKeyIds: number[]
  userData: string
  enableBackups: boolean
  labels: Record<string, string>
}): Promise<{ id: number; ipv4: string | null; ipv6: string | null; rootPassword: string | null; status: string }> {
  const data = await hzFetch('/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: opts.name,
      server_type: opts.serverType,
      location: opts.location,
      image: 'ubuntu-24.04',
      ssh_keys: opts.sshKeyIds,
      user_data: opts.userData,
      backups: opts.enableBackups,
      labels: opts.labels,
    }),
  })
  const server = data.server
  return {
    id: server.id,
    ipv4: server.public_net?.ipv4?.ip ?? null,
    ipv6: server.public_net?.ipv6?.ip ?? null,
    // Only present when no ssh_keys were supplied — the password-fallback path.
    rootPassword: data.root_password ?? null,
    status: server.status,
  }
}

export async function getServer(serverId: string): Promise<HetznerServer> {
  const data = await hzFetch(`/servers/${serverId}`)
  return data.server
}

export async function listServers(labelSelector?: string): Promise<HetznerServer[]> {
  const query = labelSelector ? `?label_selector=${encodeURIComponent(labelSelector)}` : ''
  const data = await hzFetch(`/servers${query}`)
  return data.servers
}

export async function deleteServer(serverId: string): Promise<void> {
  await hzFetch(`/servers/${serverId}`, { method: 'DELETE' })
}

// Suspension without data loss — used on payment failure past the grace
// period, distinct from deleteServer which is only ever called on full
// cancellation or an explicit admin force-delete.
export async function powerOffServer(serverId: string): Promise<void> {
  await hzFetch(`/servers/${serverId}/actions/poweroff`, { method: 'POST' })
}

export async function powerOnServer(serverId: string): Promise<void> {
  await hzFetch(`/servers/${serverId}/actions/poweron`, { method: 'POST' })
}

// The actual white-labeling mechanism: sets a Bario-branded reverse-DNS PTR
// record for the server's IP. Note this does NOT hide WHOIS/IP-ownership
// registration (RIPE will still show Hetzner Online GmbH as the network
// owner regardless) — that's public internet-infrastructure record-keeping
// and isn't something any API call can change.
export async function setReverseDns(serverId: string, ip: string, dnsPtr: string): Promise<void> {
  await hzFetch(`/servers/${serverId}/actions/change_dns_ptr`, {
    method: 'POST',
    body: JSON.stringify({ ip, dns_ptr: dnsPtr }),
  })
}
