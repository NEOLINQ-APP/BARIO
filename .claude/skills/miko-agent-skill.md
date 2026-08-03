---
name: "miko-bario-build-skill"
description: "Facts and conventions for Miko, Bario Build's AI assistant persona, and for anyone (human or Claude) extending Bario Build's agent loop"
---

# Miko — Bario Build's assistant persona

**Miko** is the name of Bario Build's in-product AI assistant (`app/api/build/agent/route.ts`'s system prompt: "You are Miko, Bario Build's AI assistant"). The same name is also used, separately, for the AI chat assistant inside the Twenty CRM instances built for AFC Logistics and Sunbuilt Group — same persona name reused deliberately across products, but genuinely different code, different system prompts, different tool sets. Don't conflate the two when working on either.

## What Miko (Bario Build) actually does

Miko writes real project files and runs real shell commands inside a live, isolated sandbox — not a fixed section/template schema like Bario's original site builder. Its fixed, reviewed tool set (`app/api/build/agent/route.ts`):

- `read_file`, `write_file`, `list_files`, `delete_file` — operate on the active sandbox session's filesystem via `lib/sandboxHost.ts`.
- `run_command` — one-off blocking commands (e.g. `npm install`), 30s timeout.
- `start_dev_server` — detached, meant to be called once per session to boot the live preview.

No free-form host access, no ability to change its own sandbox's resource limits or network policy — the tool set itself is the security boundary, not the system prompt's wording.

## Model routing (real, not aspirational)

`lib/buildAgentModel.ts`'s `callAgentModel()`:
- **Primary**: OpenAI `gpt-5.6-luna` (`reasoning_effort: 'none'` — required for tool calls on this model on the chat-completions endpoint).
- **Fallback**: Anthropic `claude-opus-5`, used only if the primary call actually errors (timeout, rate limit, outage) — not raced in parallel. Once a fallback triggers, the rest of that turn stays on Claude rather than flip-flopping back.
- This is a reliability measure. It does not make the happy-path response faster — a provider fallback only helps when the primary provider is actually failing.

## Real infrastructure Miko runs on

- A **dedicated Hetzner host** (`sandbox-host-1.bario.ca`), deliberately separate from Bario's main production VPS (which runs Twenty CRM, n8n, code-server) — so a sandbox escape can't reach those trusted services.
- Docker containers under the **gVisor `runsc`** runtime (not default `runc`) for real syscall-level isolation, with dropped capabilities, memory/CPU/pid limits, and no host networking.
- Traefik as the reverse proxy, using its **file provider** (not Docker-socket auto-discovery — that hit a real, unresolved API-version incompatibility with this Docker Engine version). Live previews get real HTTPS via a Let's Encrypt wildcard cert for `*.sandbox.bario.ca`, obtained via `certbot`+`certbot-dns-cloudflare` (DNS-01) — **not** Cloudflare's proxy/Universal SSL, which doesn't cover a second-level wildcard on the free tier.
- Every session is health-checked before reuse (`lib/sandboxHost.ts`'s `isSandboxSessionAlive()` + `lib/buildSession.ts`'s `ensureSandboxSession()`) — a DB row saying a session is "running" is never trusted blindly; a dead container is detected and silently replaced with a fresh one rather than surfacing a raw error.

## What's real vs. not yet built (check before assuming)

Real and shipped: the agent loop, the sandbox execution/isolation, HTTPS previews, the file-tree/Monaco/terminal editor UI, chat + command persistence (`build_chat_messages`), the model fallback.

Not yet built: publishing a finished project to permanent hosting (`build_published_apps` table exists, no publish flow yet), credits/billing integration, the phase-7 security hardening pass (network egress allowlisting beyond the default bridge, admin kill-switch, tuned resource limits from real usage data).

## Stack facts worth not getting wrong again

This project is Next.js 14 + Vercel + **Supabase Postgres with raw SQL** (`lib/db.ts`, via `postgres`/postgres.js through Supabase's Supavisor pooler — no ORM). It was migrated off Neon to Supabase; check `lib/db.ts`'s own comments before assuming which one is current, since this has changed before. There is no `builder.bario.ca` subdomain — everything lives on `bario.ca` itself (`/build`, `/build/apps`). "Titans Agency" was a dropped product idea (2026-07-27) and isn't part of the roadmap — don't reintroduce it in generated code or docs without the user explicitly asking again.
