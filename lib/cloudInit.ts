// Cloud-init passed as user_data at server creation. SSH key injection goes
// through Hetzner's native ssh_keys param on createServer, not through here
// — this only handles hostname + enabling automatic security patching by
// default, so a customer who never logs in isn't silently running unpatched
// software.
export function buildUserData(opts: { hostname: string }): string {
  return `#cloud-config
hostname: ${opts.hostname}
package_update: true
package_upgrade: true
packages:
  - unattended-upgrades
write_files:
  - path: /etc/apt/apt.conf.d/20auto-upgrades
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
runcmd:
  - systemctl enable --now unattended-upgrades
`
}
