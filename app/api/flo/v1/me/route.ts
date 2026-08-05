import { NextResponse } from 'next/server'
import { requireFloApiKey } from '@/lib/flo/auth'

// Deliberately has no Twenty dependency — a good first call for anyone
// integrating against the Flo API to confirm their key works before
// touching anything that depends on the workspace being linked yet.
export async function GET(req: Request) {
  const auth = await requireFloApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { crmStack } = auth

  return NextResponse.json({
    workspace: crmStack.workspace_display_name,
    subdomain: crmStack.subdomain,
    linked: !!crmStack.twenty_api_key_encrypted,
  })
}
