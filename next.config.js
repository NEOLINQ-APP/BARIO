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
