import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BARIO_HOSTNAMES = new Set(['bario.ca', 'www.bario.ca', 'localhost'])

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const hostname = host.split(':')[0].toLowerCase()

  const isBarioHost = BARIO_HOSTNAMES.has(hostname) || hostname.endsWith('.vercel.app')
  if (isBarioHost) {
    return NextResponse.next()
  }

  // Any other incoming hostname (a customer's subdomain.bario.ca or their
  // own connected custom domain) gets served from /site/[domain]. Sites are
  // single-page for now, so the original path isn't preserved.
  const url = req.nextUrl.clone()
  url.pathname = `/site/${hostname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
