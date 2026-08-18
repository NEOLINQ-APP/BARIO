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

const MAILCOW_VPS_HOST = '148.230.94.192'
const MYSQL_CONTAINER = 'mailcowdockerized-mysql-mailcow-1'
const MEMCACHED_CONTAINER = 'mailcowdockerized-memcached-mailcow-1'

function mysqlEscape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// A single SSH connection, reused for every command in one logical
// operation (read, write, cache flush) instead of opening a fresh
// connection per command. Confirmed live (2026-08-18) that 3 separate
// connections' handshake overhead was enough to blow a real request's 60s
// budget for one real customer (Sunbuilt) even though an otherwise-
// identical request (AFC, moments earlier) fit inside it -- connection
// setup time isn't consistent enough to budget 3x for on every call.
class MailVpsSession {
  private conn: Client
  private ready: Promise<void>

  constructor() {
    const privateKeyB64 = process.env.BARIO_MAIL_VPS_SSH_PRIVATE_KEY_B64
    if (!privateKeyB64) throw new Error('BARIO_MAIL_VPS_SSH_PRIVATE_KEY_B64 is not set')
    const privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8')

    this.conn = new Client()
    this.ready = new Promise<void>((resolve, reject) => {
      this.conn
        .on('ready', () => resolve())
        .on('error', (err) => reject(err))
        .connect({ host: MAILCOW_VPS_HOST, port: 22, username: 'root', privateKey, readyTimeout: 20_000 })
    })
  }

  async exec(command: string): Promise<string> {
    await this.ready
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => reject(new Error('SSH command timed out')), 30_000)

      this.conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          return reject(err)
        }
        stream
          .on('close', (code: number | null) => {
            clearTimeout(timer)
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
  }

  close(): void {
    this.conn.end()
  }

  // Every remote SQL query goes through the same DBROOT-lookup-then-mysql
  // pipeline, built as a single heredoc'd remote script so the JSON payload
  // only ever needs real MySQL-string escaping (handled in TS before it's
  // embedded), not shell escaping too -- the `<<'EOSQL'` quoted delimiter
  // disables all shell interpolation inside it.
  async sql(query: string): Promise<string> {
    const script = `
DBROOT_VAL=$(grep '^DBROOT=' /opt/mailcow-dockerized/mailcow.conf | cut -d= -f2)
docker exec -i ${MYSQL_CONTAINER} mysql -uroot -p"$DBROOT_VAL" -N mailcow <<'EOSQL'
${query}
EOSQL
`.trim()
    return this.exec(script)
  }

  // SOGo caches user profiles in Mailcow's memcached container -- confirmed
  // live (2026-08-18) that a direct MySQL write to c_defaults is NOT
  // reflected in the webmail UI until this cache is cleared, and that
  // restarting sogo-mailcow itself (the fix an *different*, already-
  // existing staleness bug uses -- see restartSogoForNewDomain()) does NOT
  // clear it, since memcached is a separate, independently-running
  // container. A flush is near-instant and doesn't drop other users'
  // active sessions, unlike a full sogo-mailcow restart, so it's used here
  // instead of that heavier fix, not in addition to it.
  async flushCache(): Promise<void> {
    await this.exec(`docker exec ${MEMCACHED_CONTAINER} sh -c 'printf "flush_all\\r\\nquit\\r\\n" | nc -w1 localhost 11211'`)
  }
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

async function readDefaults(session: MailVpsSession, sogoUid: string): Promise<Record<string, any>> {
  const raw = await session.sql(`SELECT c_defaults FROM sogo_user_profile WHERE c_uid = '${mysqlEscape(sogoUid)}';`)
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    return {}
  }
}

async function writeDefaults(session: MailVpsSession, sogoUid: string, defaults: Record<string, any>): Promise<void> {
  const json = mysqlEscape(JSON.stringify(defaults))
  await session.sql(
    `INSERT INTO sogo_user_profile (c_uid, c_defaults, c_settings) VALUES ('${mysqlEscape(sogoUid)}', '${json}', '{}')
     ON DUPLICATE KEY UPDATE c_defaults = '${json}';`
  )
}

// Adds a new external mailbox to sogoUid's own webmail, alongside whatever
// they already have configured. Returns the new entry's SOGo-internal id
// (needed later to remove it again — SOGo indexes AuxiliaryMailAccounts by
// this numeric id, not by email address).
export async function addAuxiliaryMailAccount(sogoUid: string, account: AuxAccountInput): Promise<number> {
  const session = new MailVpsSession()
  try {
    const defaults = await readDefaults(session, sogoUid)
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
    await writeDefaults(session, sogoUid, defaults)
    await session.flushCache()
    return nextId
  } finally {
    session.close()
  }
}

export async function removeAuxiliaryMailAccount(sogoUid: string, accountId: number): Promise<void> {
  const session = new MailVpsSession()
  try {
    const defaults = await readDefaults(session, sogoUid)
    const existing: any[] = Array.isArray(defaults.AuxiliaryMailAccounts) ? defaults.AuxiliaryMailAccounts : []
    defaults.AuxiliaryMailAccounts = existing.filter((a) => Number(a.id) !== accountId)
    await writeDefaults(session, sogoUid, defaults)
    await session.flushCache()
  } finally {
    session.close()
  }
}
