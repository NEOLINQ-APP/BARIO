import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BARIO_HOSTNAMES = new Set(['bario.ca', 'www.bario.ca', 'localhost'])
const STORAGE_HOSTNAME = 'storage.bario.ca'

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const hostname = host.split(':')[0].toLowerCase()

  // A dedicated address for the internal file manager rather than another
  // customer subdomain — root path lands straight on it (still gated by the
  // page's own admin-session check, this is just a routing shortcut).
  if (hostname === STORAGE_HOSTNAME) {
    if (req.nextUrl.pathname === '/') {
      const url = req.nextUrl.clone()
      url.pathname = '/admin/storage'
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  const isBarioHost = BARIO_HOSTNAMES.has(hostname) || hostname.endsWith('.vercel.app')
  if (isBarioHost) {
    return NextResponse.next()
  }

  // Any other incoming hostname (a customer's subdomain.bario.ca or their
  // own connected custom domain) gets served from /site/[domain]/[[...path]].
  // The path is preserved (multi-page sites resolve it against site_pages),
  // but this is fully backward-compatible: a site with no site_pages rows
  // renders identically regardless of path, per app/site/[domain]/[[...path]]/route.ts.
  const url = req.nextUrl.clone()
  const path = req.nextUrl.pathname === '/' ? '' : req.nextUrl.pathname
  url.pathname = `/site/${hostname}${path}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
