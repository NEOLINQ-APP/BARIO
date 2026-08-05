import { Client } from 'ssh2'

// SSHes into a 'wordpress' app_type VPS as root using Bario's own
// management key (BARIO_VPS_MGMT_SSH_PRIVATE_KEY — see
// lib/vpsProvision.ts's ensureManagementSshKeyId, added to every such box
// regardless of what key/password the customer chose) to run one command
// and capture its output. Used by the "Issue HTTPS certificate" route to
// invoke /root/wordpress/issue-cert.sh on the customer's own box.
export async function execOnWordPressVps(host: string, command: string, timeoutMs = 120_000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  // Stored base64-encoded (BARIO_VPS_MGMT_SSH_PRIVATE_KEY_B64) — a raw
  // multi-line PEM/OpenSSH key passed through `vercel env add --value`
  // was silently truncated to just its first line (a real bug hit and
  // confirmed live), so the multi-line value never touches the CLI's own
  // argument handling at all.
  const privateKeyB64 = process.env.BARIO_VPS_MGMT_SSH_PRIVATE_KEY_B64
  if (!privateKeyB64) throw new Error('BARIO_VPS_MGMT_SSH_PRIVATE_KEY_B64 is not set')
  const privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8')

  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timer = setTimeout(() => {
      conn.end()
      reject(new Error('SSH command timed out'))
    }, timeoutMs)

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer)
            conn.end()
            return reject(err)
          }
          let stdout = ''
          let stderr = ''
          stream
            .on('close', (code: number | null) => {
              clearTimeout(timer)
              conn.end()
              resolve({ stdout, stderr, code })
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString('utf8')
            })
            .stderr.on('data', (data: Buffer) => {
              stderr += data.toString('utf8')
            })
        })
      })
      .on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      .connect({ host, port: 22, username: 'root', privateKey, readyTimeout: 20_000 })
  })
}
