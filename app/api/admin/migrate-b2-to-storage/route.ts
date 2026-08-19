import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-off migration: copies every object from the old B2 bucket into the
// new MinIO bucket under the same key, so existing DB rows only need a
// base-URL swap afterward (not a per-object URL remap). Runs server-side
// specifically because it's the only place both B2's and MinIO's real
// credentials exist at once -- both are Sensitive Vercel env vars, neither
// readable from outside a running request.
//
// GET with no params: dry-run, lists+counts objects without copying.
// GET ?execute=true: actually copies everything.
export const maxDuration = 300

function b2Client(): S3Client {
  return new S3Client({
    endpoint: `https://${process.env.B2_ENDPOINT}`,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.B2_KEY_ID!,
      secretAccessKey: process.env.B2_APPLICATION_KEY!,
    },
  })
}

function minioClient(): S3Client {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT!,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.STORAGE_SECRET_KEY!,
    },
  })
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const execute = new URL(req.url).searchParams.get('execute') === 'true'
    const b2Bucket = process.env.B2_BUCKET_NAME!
    const minioBucket = process.env.STORAGE_BUCKET_NAME || 'bario-storage'

    const b2 = b2Client()
    const minio = minioClient()

    let continuationToken: string | undefined
    let totalObjects = 0
    let totalBytes = 0
    let copied = 0
    let failed: { key: string; error: string }[] = []

    do {
      const list = await b2.send(
        new ListObjectsV2Command({ Bucket: b2Bucket, ContinuationToken: continuationToken })
      )
      for (const obj of list.Contents ?? []) {
        if (!obj.Key) continue
        totalObjects++
        totalBytes += obj.Size ?? 0

        if (execute) {
          try {
            const got = await b2.send(new GetObjectCommand({ Bucket: b2Bucket, Key: obj.Key }))
            const bytes = await got.Body!.transformToByteArray()
            await minio.send(
              new PutObjectCommand({
                Bucket: minioBucket,
                Key: obj.Key,
                Body: bytes,
                ContentType: got.ContentType,
              })
            )
            copied++
          } catch (err: any) {
            failed.push({ key: obj.Key, error: err.message ?? String(err) })
          }
        }
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
    } while (continuationToken)

    return NextResponse.json({
      ok: true,
      mode: execute ? 'executed' : 'dry-run',
      totalObjects,
      totalBytes,
      totalMB: Math.round((totalBytes / 1024 / 1024) * 100) / 100,
      copied: execute ? copied : undefined,
      failed: execute ? failed : undefined,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
