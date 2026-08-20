const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ssh2 (lib/wpVpsManage.ts) ships a prebuilt native .node binary that
  // webpack can't parse as JS — the standard Next.js fix for any native
  // Node addon (ssh2, sharp, bcrypt, etc.) is to exclude it from the
  // webpack bundle and let it load via a normal Node require() at runtime
  // instead, which Vercel's serverless functions support fine.
  experimental: {
    // ffmpeg-static also needs to be here, not just excluded via
    // outputFileTracingIncludes below — confirmed via a real production
    // 500 (spawn .../app/api/studio/export/ffmpeg ENOENT): webpack was
    // inlining ffmpeg-static's own index.js INTO route.js, which breaks its
    // internal __dirname-based binary-path resolution (__dirname inside
    // inlined code resolves to route.js's own directory, not
    // node_modules/ffmpeg-static/). Listing it here makes Next.js require()
    // it normally at runtime instead, the same fix ssh2 already needed for
    // its own unrelated reason (a .node addon webpack can't parse at all).
    serverComponentsExternalPackages: ['ssh2', 'ffmpeg-static'],
    // ffmpeg-static's actual ffmpeg binary is a plain on-disk file — even
    // externalized above, Vercel's serverless bundler traces
    // require()/import graphs to decide what non-JS files to include, and
    // misses a binary only ever referenced via a computed path string, so
    // it has to be listed explicitly too or the deployed function 404s
    // trying to spawn a file that was never uploaded.
    // Key is matched (picomatch, contains:true) against the internal
    // normalized route string, which for an app-router route.ts keeps the
    // 'app' segment but drops the trailing 'route' leaf segment (confirmed
    // by calling next's own normalizeAppPath directly) — 'app/api/.../route'
    // (matching the source file path) does NOT match and silently includes
    // nothing, which is exactly what happened on the first attempt here.
    outputFileTracingIncludes: {
      'app/api/studio/export': ['./node_modules/ffmpeg-static/**', './assets/fonts/**'],
    },
  },
}

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
})
