// Manages SOGo's "auxiliary IMAP account" feature — an existing Bario
// mailbox's webmail can also poll and send through a completely separate,
// externally-hosted mailbox, so a customer sees both in one inbox without
// migrating anything. There's no documented SOGo API for this; the real
// storage location was found by driving the actual SOGo UI with a real
// browser while capturing network traffic, then confirmed directly against
// the database: `sogo_user_profile.c_defaults` is a JSON blob (most of
// SOGo's own general preferences) containing an `AuxiliaryMailAccounts`
// array under that same key path the UI's Angular controller uses
// (`app.preferences.defaults.AuxiliaryMailAccounts`). Written to directly
// over SSH + the mysql CLI (same transport `restartSogoForNewDomain()`
// already uses) rather than browser automation, which would be far more
// fragile against any future SOGo UI change.
import { Client } from 'ssh2'
import { restartSogo } from './mailcow'

const MAILCOW_VPS_HOST = '148.230.94.192'
const MYSQL_CONTAINER = 'mailcowdockerized-mysql-mailcow-1'

function mysqlEscape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function runMailVpsSsh(command: string): Promise<string> {
  const privateKeyB64 = process.env.BARIO_MAIL_VPS_SSH_PRIVATE_KEY_B64
  if (!privateKeyB64) throw new Error('BARIO_MAIL_VPS_SSH_PRIVATE_KEY_B64 is not set')
  const privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8')

  return new Promise<string>((resolve, reject) => {
    const conn = new Client()
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      conn.end()
      reject(new Error('SSH command timed out'))
    }, 30_000)

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer)
            conn.end()
            return reject(err)
          }
          stream
            .on('close', (code: number | null) => {
              clearTimeout(timer)
              conn.end()
              if (code === 0) resolve(stdout)
              else reject(new Error(`Command exited with code ${code}: ${stderr.slice(0, 500)}`))
            })
            .on('data', (d: Buffer) => {
              stdout += d.toString('utf8')
            })
            .stderr.on('data', (d: Buffer) => {
              stderr += d.toString('utf8')
            })
        })
      })
      .on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      .connect({ host: MAILCOW_VPS_HOST, port: 22, username: 'root', privateKey, readyTimeout: 20_000 })
  })
}

// Every remote query goes through the same DBROOT-lookup-then-mysql
// pipeline, built as a single heredoc'd remote script so the JSON payload
// only ever needs real MySQL-string escaping (handled here in TS before
// it's embedded), not shell escaping too — the `<<'EOSQL'` quoted
// delimiter disables all shell interpolation inside it.
async function runMailcowSql(sql: string): Promise<string> {
  const script = `
DBROOT_VAL=$(grep '^DBROOT=' /opt/mailcow-dockerized/mailcow.conf | cut -d= -f2)
docker exec -i ${MYSQL_CONTAINER} mysql -uroot -p"$DBROOT_VAL" -N mailcow <<'EOSQL'
${sql}
EOSQL
`.trim()
  return runMailVpsSsh(script)
}

type AuxAccountInput = {
  label: string
  email: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  password: string
}

async function readDefaults(sogoUid: string): Promise<Record<string, any>> {
  const raw = await runMailcowSql(
    `SELECT c_defaults FROM sogo_user_profile WHERE c_uid = '${mysqlEscape(sogoUid)}';`
  )
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    return {}
  }
}

async function writeDefaults(sogoUid: string, defaults: Record<string, any>): Promise<void> {
  const json = mysqlEscape(JSON.stringify(defaults))
  await runMailcowSql(
    `INSERT INTO sogo_user_profile (c_uid, c_defaults, c_settings) VALUES ('${mysqlEscape(sogoUid)}', '${json}', '{}')
     ON DUPLICATE KEY UPDATE c_defaults = '${json}';`
  )
}

// Adds a new external mailbox to sogoUid's own webmail, alongside whatever
// they already have configured. Returns the new entry's SOGo-internal id
// (needed later to remove it again — SOGo indexes AuxiliaryMailAccounts by
// this numeric id, not by email address).
export async function addAuxiliaryMailAccount(sogoUid: string, account: AuxAccountInput): Promise<number> {
  const defaults = await readDefaults(sogoUid)
  const existing: any[] = Array.isArray(defaults.AuxiliaryMailAccounts) ? defaults.AuxiliaryMailAccounts : []
  const nextId = existing.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1

  existing.push({
    id: nextId,
    name: account.label,
    serverName: account.imapHost,
    port: account.imapPort,
    encryption: account.imapPort === 993 ? 'ssl' : 'tls',
    smtpServerName: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpEncryption: account.smtpPort === 465 ? 'ssl' : 'tls',
    smtpAuth: 1,
    userName: account.email,
    password: account.password,
    identities: [{ email: account.email, fullName: account.label }],
    receipts: {
      receiptAction: 'ignore',
      receiptAnyAction: 'ignore',
      receiptOutsideDomainAction: 'ignore',
      receiptNonRecipientAction: 'ignore',
    },
  })
  defaults.AuxiliaryMailAccounts = existing
  await writeDefaults(sogoUid, defaults)
  // Confirmed live (2026-08-18): SOGo doesn't reliably pick up a direct
  // MySQL write to c_defaults without this -- same underlying staleness
  // restartSogoForNewDomain() already exists to fix for a different
  // trigger (a brand-new Mailcow domain). Real repro: added an account,
  // it showed up correctly; removed it via direct SQL, the webmail UI
  // kept showing the deleted entry until sogo-mailcow was restarted.
  await restartSogo()
  return nextId
}

export async function removeAuxiliaryMailAccount(sogoUid: string, accountId: number): Promise<void> {
  const defaults = await readDefaults(sogoUid)
  const existing: any[] = Array.isArray(defaults.AuxiliaryMailAccounts) ? defaults.AuxiliaryMailAccounts : []
  defaults.AuxiliaryMailAccounts = existing.filter((a) => Number(a.id) !== accountId)
  await writeDefaults(sogoUid, defaults)
  await restartSogo()
}
