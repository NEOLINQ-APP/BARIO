# HydroBlasters.ca — Access & How-To Reference

New client, onboarded 2026-08-31. Mobile pressure washing / detailing / branded supply store. Hosted on BARIO (not a separate VPS like AFC/Sunbuilt) — single-page raw-HTML site imported via the admin API, live at **https://hydroblasters.bario.ca** (custom domain `hydroblasters.ca` not yet connected — DNS/registrar access unconfirmed, see below).

---

## Account & login

- **Login**: https://www.bario.ca/login — `admin@hydroblasters.ca` / `qzU8TQy6k1YtAa1!`
- **Bario One org**: `HydroBlasters.ca` (id `6049f2ce-74d6-4ff9-8294-adc14fdb7cf2`), all 8 modules enabled (CRM, Invoicing, Payments, Employees, Payroll, POS, AI Assistant, API/Webhooks), 14-day no-card trial started 2026-08-31 (ends 2026-09-14).
- **Site**: id `c7460c23-4331-4b96-bd75-31b5ad9c20d3`, subdomain `hydroblasters`, `content_mode = 'template'` (raw HTML, not the section builder).

## What's real vs. what's still a mockup

The original file (client-supplied) simulated a full multi-portal system entirely in front-end JS: a "Tech Portal" and an "Admin OS Gate" gated by a hardcoded `admin123` password, showing fake revenue/job data. Before going live this was cut down:

- **Admin OS Gate / Tech Portal removed entirely** — the two nav buttons and both footer links now point straight to `https://www.bario.ca/login`, the real thing. No more fake password sitting on a public production domain.
- **Booking wizard (Step 4 "Confirm & Dispatch Order") is real** — see below.
- **Still a front-end-only mockup, not wired to anything real**: the "Client Portal" view (shows a hardcoded fake customer "Sarah Jenkins"), the AI chat widget (canned keyword responses, not a real model), and the branded store's "Add to Cart" (no real checkout). None of these were in scope for this pass — flag it if the client wants any of them built for real.

## Booking → CRM wiring

The booking wizard's confirm button POSTs to `https://www.bario.ca/api/public/site-lead` with `businessKey: "hydroblasters"`. This is the **same production endpoint** afclogistics.ca and sunbuiltgroup.com already use (`app/api/public/site-lead/route.ts`) — HydroBlasters was added to its `ALLOWED_BUSINESS_KEYS` allowlist and to `BARIO_ONE_CALL_LOG_ORG_IDS` in `lib/barioOneCrmCallLog.ts`, rather than building a separate pipeline. A submission creates/updates a `bo_customers` row (matched by email) and logs a note with the service, notes, and estimated price — visible immediately at **Dashboard → Bario One → CRM → Leads**.

Verified live end-to-end 2026-08-31: a real Playwright run through the actual booking wizard on `hydroblasters.bario.ca` produced a real lead visible in the logged-in CRM dashboard (screenshotted, then deleted as test data).

**Known limitation carried over from the original design**: the Step 4 price summary ($397.94 CAD) is a static placeholder — it doesn't actually price off the category/subcategory/add-on selected in Step 1. Real numbers still need a pricing engine; not built this pass.

## Image audit — 2026-09-01

The client-supplied file's Unsplash URLs were partly hallucinated (real-looking IDs that don't exist) and partly just wrong photos. Found by checking every `<img>`/background-image URL's real HTTP status, not just eyeballing the page:
- **2 hard 404s** (hero banner + "Automotive & Light Trucks" card shared one broken id; "Heavy Equipment & Machinery" card) — one was a single-character typo away from a real, relevant photo (`f9917d1beb6d` vs. the real `f9917d1eea6f`), suggesting that's literally how it broke.
- **4 store product images loaded fine (200 OK) but showed the wrong thing entirely** — "HydroShield Ceramic Wash" was a jar of toothbrushes, "BlastOff Degreaser" was blister-pack pills, "Air Freshener 3-Pack" was a wrapped gift box, and the microfiber towel photo was an unrelated cleaning-gloves shot. A pure HTTP-status check would have called all 4 "working" — worth remembering that "loads" and "correct" are different checks.

All 6 replaced with real, verified Unsplash photos (searched via the API, checked visually before committing, `download_location` pinged per Unsplash's compliance terms) — matching subjects, no visible third-party branding (rejected a Febreze can and a few candidates with cosmetic-brand mockup text). Re-imported via `/api/admin/users/import-html`, confirmed live via a fresh (cache-busted) fetch and a full-page Playwright screenshot.

## Domain cutover (hydroblasters.ca)

Not connected yet — user chose to stage on the `.bario.ca` subdomain first. To connect the real domain: confirm DNS/registrar access for `hydroblasters.ca`, then use `/api/admin/users/connect-domain` (Cloudflare zone + Vercel cert, same flow as every other client site) followed by `/api/admin/users/verify-domain` — **DNS pointing correctly does NOT automatically flip `domain_status` to `verified`**, the verify step has to actually run or the site 404s despite correct DNS (bit AFC/Sunbuilt/rapturemedia before).

## Deploy note

The CRM wiring (`ALLOWED_BUSINESS_KEYS` + org id) required a real code change + `vercel --prod` deploy (commit `e4e4a81`, 2026-08-31) — this isn't something the admin API alone can do. If HydroBlasters is ever removed/paused, remove `hydroblasters` from both places in the same two files and redeploy.
