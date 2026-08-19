import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// File storage backend — self-hosted MinIO (S3-compatible), not a paid
// per-GB service. Replaces Backblaze B2 (2026-08-19): B2 was undercutting
// margin on every storage tier above Plus (confirmed live: $6.95/TB B2 cost
// vs. the actual subscription price meant B2 storage cost alone exceeded
// revenue on Pro/Max/Ultra at full utilization -- see
// bario_xdrive_storage_migration memory for the real numbers). MinIO runs
// on a VPS Bario already pays a flat monthly rate for regardless of how
// full it gets, so marginal cost per additional TB is ~$0 up to disk
// capacity, not a linear per-GB fee -- the actual fix for that margin
// problem, not just a cheaper vendor.
//
// Same S3-compatible call shape as the B2 module it replaces (which itself
// was a drop-in replacement for @vercel/blob's put()/del()), so none of
// the ~19 call sites needed anything beyond a one-line import path change.

const BUCKET = process.env.STORAGE_BUCKET_NAME || 'bario-storage'
const PUBLIC_BASE = process.env.STORAGE_PUBLIC_BASE_URL || `https://storage.bario.ca/${BUCKET}`

let _client: S3Client | undefined
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT!,
      region: 'us-east-1', // MinIO ignores region, but the SDK requires a value
      forcePathStyle: true, // MinIO is path-style (endpoint/bucket/key), not virtual-hosted-style
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY!,
        secretAccessKey: process.env.STORAGE_SECRET_KEY!,
      },
    })
  }
  return _client
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

export type PutOptions = {
  access: 'public'
  addRandomSuffix?: boolean
  contentType?: string
}

export type PutResult = { url: string; pathname: string }

// Mirrors @vercel/blob's put(pathname, body, opts) signature closely enough
// that call sites barely change. addRandomSuffix defaults to true, same as
// Vercel Blob's own default, to avoid same-name collisions.
export async function put(pathname: string, body: Buffer | Uint8Array | ArrayBuffer | Blob | string, opts: PutOptions): Promise<PutResult> {
  const wantsSuffix = opts.addRandomSuffix !== false
  let key = pathname.replace(/^\/+/, '')
  if (wantsSuffix) {
    const lastDot = key.lastIndexOf('.')
    const suffix = randomSuffix()
    key = lastDot === -1 ? `${key}-${suffix}` : `${key.slice(0, lastDot)}-${suffix}${key.slice(lastDot)}`
  }

  let bytes: Uint8Array
  if (body instanceof Blob) {
    bytes = new Uint8Array(await body.arrayBuffer())
  } else if (body instanceof ArrayBuffer) {
    bytes = new Uint8Array(body)
  } else if (typeof body === 'string') {
    bytes = new TextEncoder().encode(body)
  } else {
    bytes = body
  }

  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: opts.contentType,
    })
  )

  return { url: `${PUBLIC_BASE}/${key}`, pathname: key }
}

export type PresignedUploadOptions = {
  addRandomSuffix?: boolean
  contentType?: string
  expiresInSeconds?: number
}

export type PresignedUploadResult = { uploadUrl: string; url: string; pathname: string }

// Replaces @vercel/blob/client's handleUpload() token flow -- the browser
// PUTs the file bytes directly to the returned uploadUrl (no auth header
// needed, the signature is embedded in the URL), then uses `url` as the
// permanent public URL, same as every other consumer in this file expects.
export async function createPresignedUploadUrl(pathname: string, opts: PresignedUploadOptions = {}): Promise<PresignedUploadResult> {
  const wantsSuffix = opts.addRandomSuffix !== false
  let key = pathname.replace(/^\/+/, '')
  if (wantsSuffix) {
    const lastDot = key.lastIndexOf('.')
    const suffix = randomSuffix()
    key = lastDot === -1 ? `${key}-${suffix}` : `${key.slice(0, lastDot)}-${suffix}${key.slice(lastDot)}`
  }

  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: opts.contentType }),
    { expiresIn: opts.expiresInSeconds ?? 300 }
  )

  return { uploadUrl, url: `${PUBLIC_BASE}/${key}`, pathname: key }
}

// Accepts either a full URL or a bare key. Still handles the two legacy
// URL shapes from BOTH prior backends (Vercel Blob, then B2) so a DB row
// that predates either migration and was never rewritten still deletes
// from the right place instead of silently no-op'ing against MinIO and
// leaving the real file orphaned on whichever old backend actually has it.
export async function del(urlOrKey: string): Promise<void> {
  if (urlOrKey.includes('vercel-storage.com')) {
    const { del: vercelDel } = await import('@vercel/blob')
    await vercelDel(urlOrKey)
    return
  }
  if (urlOrKey.includes('backblazeb2.com')) {
    const { del: b2Del } = await import('./b2Storage')
    await b2Del(urlOrKey)
    return
  }
  const key = urlOrKey.startsWith('http') ? new URL(urlOrKey).pathname.replace(new RegExp(`^/(${BUCKET}/)?`), '') : urlOrKey.replace(/^\/+/, '')
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: decodeURIComponent(key) }))
}
