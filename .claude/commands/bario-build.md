---
description: "Work on Bario Build — the self-hosted AI app/site builder at /build/apps"
allowed-tools: Bash(*), Read(*), Write(*), Edit(*)
---

# Bario Build — working context

Bario Build is a **second, separate** AI builder product from Bario's original section-based site builder (`/build`, "Bario AI"). It lets a user describe an app in plain language and an AI assistant named **Miko** writes real project files and runs real shell commands in a live sandbox — a genuine running app, not a fixed template.

## Real stack (do not substitute)

- Next.js 14 App Router, deployed to Vercel via `vercel --prod --yes` (no git-push-triggered deploy, no staging environment).
- **Supabase Postgres, raw tagged SQL via `postgres` (postgres.js)** (`lib/db.ts`), connected through Supabase's Supavisor pooler (transaction mode, port 6543, `max: 1`, `prepare: false`) — no ORM, no Prisma. This project was migrated off Neon to Supabase (Neon's driver only spoke its own HTTP-proxy protocol, incompatible with Supabase); the `sql\`...\`` tagged-template call sites elsewhere didn't change. `ensureSchema()` in `lib/db.ts` is schema-as-code; add tables/columns there.
- Session-cookie auth (`lib/session.ts`), not a third-party auth provider.
- Tailwind CSS.

## Bario Build's actual pieces

- Route: **`/build/apps`** (top-level, outside the `(account)` dashboard-chrome group — full-screen editor, no sidebar, same convention as `/build`).
- UI: `components/BuildEditor.tsx` — chat panel + Preview/Code tabs, file tree, Monaco editor, xterm-style terminal log. Deliberately its own visual identity: violet/near-black (`#08080b` bg, violet-600 accent, cyan "live" indicator) — distinct from the amber/slate look used by the rest of Bario's dashboard and by the original site builder.
- Agent loop: `app/api/build/agent/route.ts` — genuine multi-turn tool-calling (read_file, write_file, list_files, delete_file, run_command, start_dev_server), NDJSON-streamed. Model abstraction in `lib/buildAgentModel.ts`: **OpenAI `gpt-5.6-luna` primary, Claude `claude-opus-5` automatic fallback** if the primary call errors (a reliability measure, not a speed one).
- Execution: `lib/sandboxHost.ts` talks to a small internal API (`/opt/sandbox-host-api` on `sandbox-host-1.bario.ca`, a **dedicated Hetzner host, isolated from Bario's main VPS**) running Docker containers under the **gVisor (`runsc`)** runtime for real isolation. Traefik routes live previews at `https://sess-<id>.sandbox.bario.ca` (real Let's Encrypt wildcard cert via `certbot`+`certbot-dns-cloudflare`, not Cloudflare's proxy — Cloudflare's free Universal SSL doesn't cover a second-level wildcard).
- Persistence: `build_chat_messages` (full chat + every tool call/result, per project — reopening a project restores real history), `build_files`, `build_sandbox_sessions`, `build_published_apps` (see `lib/db.ts`).
- Legal gate: `/legal/sandbox-aup`, a separate policy from the site builder's `/legal/studio-aup` — running arbitrary code is a different risk profile from GPU media generation.
- Full architecture/build-order plan: `C:\Users\surew\.claude\plans\unified-wishing-salamander.md`.

## Explicitly not part of this project

- No Supabase — this project has never used it.
- No `builder.bario.ca` subdomain — the builder lives at `/build` and `/build/apps` on bario.ca itself.
- No "Titans Agency" — that platform idea was explicitly dropped by the user on 2026-07-27 and isn't part of Bario's roadmap.
- "Miko" is Bario Build's assistant persona; it's also, separately, the name of the AI chat assistant inside the Twenty CRM instances built for AFC Logistics/Sunbuilt Group — same name, two different products, not the same code.

## When asked to extend Bario Build

1. Check `lib/db.ts` for existing `build_*` tables before adding new ones.
2. Reuse `lib/buildSession.ts`'s `ensureSandboxSession()` for anything that needs a live sandbox — it already health-checks and auto-recovers dead sessions.
3. New tools for the agent go in `app/api/build/agent/route.ts`'s `TOOLS` array + `runTool()` switch — keep the tool set small and reviewed, not open-ended host access.
4. Match the existing visual identity in `components/BuildEditor.tsx` (violet/near-black, monospace for file paths/terminal) rather than the amber Bario dashboard look.
5. Type-check (`npx tsc --noEmit -p .`) and deploy (`vercel --prod --yes`) before calling anything done — this project has no staging environment, test against real production.
