const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ssh2 (lib/wpVpsManage.ts) ships a prebuilt native .node binary that
  // webpack can't parse as JS — the standard Next.js fix for any native
  // Node addon (ssh2, sharp, bcrypt, etc.) is to exclude it from the
  // webpack bundle and let it load via a normal Node require() at runtime
  // instead, which Vercel's serverless functions support fine.
  experimental: {
    serverComponentsExternalPackages: ['ssh2'],
    // ffmpeg-static (lib/studioExport.ts) ships its actual ffmpeg binary as
    // a plain on-disk file, not a bundled JS/native-addon dependency — the
    // ssh2 exclusion above solves a different problem (a .node addon
    // webpack can't parse). Vercel's serverless bundler traces
    // require()/import graphs to decide what to include and misses
    // binaries only ever referenced via a computed path string, so the
    // binary has to be listed explicitly or the deployed function 404s
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
