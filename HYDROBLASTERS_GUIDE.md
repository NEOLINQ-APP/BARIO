# HydroBlasters.ca — Access & How-To Reference

New client, onboarded 2026-08-31. Mobile pressure washing / detailing / branded supply store. Hosted on BARIO (not a separate VPS like AFC/Sunbuilt) — single-page raw-HTML site imported via the admin API. **Live at the real domain, `https://hydroblasters.ca`** (and `www.`) as of 2026-09-01 — user added the DNS records, `verify-domain` run and confirmed `verified`. Still also reachable at `https://hydroblasters.bario.ca` (same site, both resolve).

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

## Service catalog, Hydro AI, and real booking — 2026-09-01

Superseded the simple site-lead wiring described below with a full pricing/booking system, built from a detailed spec the client pasted in.

- **`bo_service_catalog`** (new Bario One platform table, org-scoped, reusable by any client) holds every package/add-on: category, subcategory, name, `price_type` (`fixed` / `starting` / `custom_quote`), `price_cents`, `estimated_duration_hours`, inclusions/exclusions, `is_addon`. HydroBlasters' full 140-item catalog lives in `lib/hydroblastersCatalog.ts`, transcribed from the client's pricing sheet, seeded via `POST /api/admin/bario-one/organizations/[id]/catalog`.
- **Admin can edit prices/packages** via `PATCH /api/admin/bario-one/organizations/[id]/catalog/[itemId]` (curl/API today — no dashboard UI yet, that's the natural next step). A change is live on the public catalog API within ~60s (its own cache) and immediately in Hydro's next reply (no cache there — it re-reads the DB every message).
- **Public catalog read**: `GET /api/public/service-catalog?businessKey=hydroblasters` — the single source both the booking wizard's JS and Hydro's system prompt read from, so they can never show conflicting prices. CORS-open (`Access-Control-Allow-Origin: *`) since it's called cross-origin from the client's own site.
- **Hydro AI** (`POST /api/public/hydroblasters/hydro-chat`) replaced the old canned-keyword chat widget — a real `gpt-4o-mini` call (same pattern as Aria, `app/api/assistant/chat`) with the live catalog built into its system prompt every request. Follows the client's exact rules: never invents a price or inclusion, distinguishes fixed/starting/custom-quote correctly, never discloses the internal $100 setup-fee folding, can't claim to have booked/charged/checked availability (directs to the real wizard instead). **Verified live** against the spec's own acceptance-test questions — correct SUV Signature Detail price, correct custom-quote refusal + explanation for a 45ft boat, correct add-on math (Signature Detail + Ceramic Coating = right subtotal), and correctly refused to invent Ultimate Detail's inclusions (that package has no inclusions list in the catalog, matching the client's own instruction not to invent one).
- **Real booking-confirmation endpoint**: `POST /api/public/hydroblasters/book` (dedicated — NOT the shared site-lead route, see below for why) takes the selected catalog item ids, computes a real subtotal + GST + duration, enforces the 72-hour job-spacing rule (`lib/hydroblastersBooking.ts`, see next section), and only then creates a real `bo_customers` + `bo_deals` + `bo_appointments` row. Booking wizard's Step 1 (category/package/add-ons) and Step 4 (estimate) are now fully dynamic, reading live from the catalog API — no more hardcoded prices anywhere in the HTML.
- **Real bug found + fixed during testing**: `estimated_duration_hours` is a Postgres `NUMERIC` column, which `postgres.js` returns as a **string**, not a number. Summing it across multiple selected items was doing string concatenation ("2" + "3.5" = "23.5") instead of addition — silently produced wildly wrong appointment durations, and outright crashed (500) whenever the concatenated string had two decimal points (invalid number → NaN → Invalid Date → real DB insert failure). Caught via a real Playwright run against the live site (not just curl), reproduced, fixed with explicit `Number(...)` coercion everywhere this column is read.

**Why a separate booking endpoint instead of extending site-lead**: site-lead is deliberately simple (creates a customer + logs a note) and shared across afclogistics.ca/sunbuiltgroup.com — bolting HydroBlasters-specific scheduling math onto a shared multi-tenant route would risk breaking those. HydroBlasters' booking form still isn't on site-lead at all anymore as of this pass.

## Booking spacing rule (`lib/hydroblastersBooking.ts`)

Owner's own words: *"make sure booking are atleast 72hours apart unless the job is 4 hours or less to do then we can do 2 jobs a day. Cause we need time to setup since we are just starting."* Implemented as: any two jobs need >=72h between one ending and the next starting, UNLESS both are <=4h (using the catalog's real `estimated_duration_hours`, package + add-ons summed) AND fall on the same calendar day in `America/Edmonton` — in which case up to 2 short jobs can share a day. A violating request gets a real `409` with a human-readable reason, shown to the customer in the wizard (not a generic failure). This is HydroBlasters-specific business logic, not a generic Bario One feature — lives in application code keyed off the org id, not the platform schema.

## Field GPS tracking (Bario One platform feature, built for this request)

New tables: `bo_driver_locations` (one row per employee — latest position only, not a history log) and `bo_appointments.arrived_at`/`service_lat`/`service_lng`. **Arrival is GPS-verified, not a manual button**: `POST /api/bario-one/driver/ping` (an employee's browser calls this every ~20s while sharing is on) geocodes the job address once (OSM Nominatim — free, no API key; Google Maps keys elsewhere in this project belong to different apps/billing, not reused here) and checks Haversine distance; within 150m auto-sets `arrived_at` and logs a CRM note.
- **Owner/admin view**: Dashboard → Bario One → Appointments → **Field Tracking** — live Leaflet/OpenStreetMap map (no API key), polls `GET /api/bario-one/driver/locations` every 15s. Verified live: page loads, auth+module-gate correct, renders the empty state correctly (no one sharing yet).
- **Employee view**: same page shows a "Share my location" control — pick an active job, hit Start, `navigator.geolocation.watchPosition` handles the rest automatically.
- **Not yet real-world tested**: no actual employee/driver accounts exist on this org yet (only the owner account) — the ping endpoint's logic type-checks and the UI renders correctly, but hasn't been exercised by a real driver with real geolocation. Add real employee accounts (Dashboard → Team → Add Employee, with their own login) before this does anything for the owner to watch.

## Already-existing Bario One features (no new build needed)

The client also asked for "contact clients from the admin panel," "a dashboard with payments/purchases/last appointment," and "special offers" — all of this already exists as part of the Bario One CRM the org already has (all 8 modules): per-customer SMS/email (`Dashboard → CRM → Customers → [customer]`), invoices/payments history, appointment history, and email campaigns (`Dashboard → Marketing → Campaigns`) for special offers. Nothing new was built here — flagged to the user rather than duplicating existing functionality. "Keep everyone's profile in our own CRM" is already true: this org's `bo_customers` table is private to HydroBlasters, not shared with any other Bario One client.

## Image audit — 2026-09-01

The client-supplied file's Unsplash URLs were partly hallucinated (real-looking IDs that don't exist) and partly just wrong photos. Found by checking every `<img>`/background-image URL's real HTTP status, not just eyeballing the page:
- **2 hard 404s** (hero banner + "Automotive & Light Trucks" card shared one broken id; "Heavy Equipment & Machinery" card) — one was a single-character typo away from a real, relevant photo (`f9917d1beb6d` vs. the real `f9917d1eea6f`), suggesting that's literally how it broke.
- **4 store product images loaded fine (200 OK) but showed the wrong thing entirely** — "HydroShield Ceramic Wash" was a jar of toothbrushes, "BlastOff Degreaser" was blister-pack pills, "Air Freshener 3-Pack" was a wrapped gift box, and the microfiber towel photo was an unrelated cleaning-gloves shot. A pure HTTP-status check would have called all 4 "working" — worth remembering that "loads" and "correct" are different checks.

All 6 replaced with real, verified Unsplash photos (searched via the API, checked visually before committing, `download_location` pinged per Unsplash's compliance terms) — matching subjects, no visible third-party branding (rejected a Febreze can and a few candidates with cosmetic-brand mockup text). Re-imported via `/api/admin/users/import-html`, confirmed live via a fresh (cache-busted) fetch and a full-page Playwright screenshot.

## Full site rebuild — two-division architecture — 2026-09-02

Client sent a large spec asking for a Next.js/React rebuild with a strict two-division IA. Clarified with the user first (real infra decision, not a content tweak): kept the current hosting (raw_html on BARIO, same domain/CRM/GPS-tracking work already shipped) rather than standing up a separate Next.js/Vercel project — same visual/interactive result, no new infrastructure. User confirmed ("why don't we use both" + showed the existing wizard as the base to build from).

**Architecture — "CRITICAL... never mix" honored throughout**:
- **HB - Pressure Washing** = properties only (Residential/Commercial/Industrial sub-tabs)
- **HB - Mobile Detailing** = vehicles/equipment only (Automotive/Marine/Motorcycle/Semi Truck/Heavy Equipment sub-tabs)
- Old mixed "Our Full Mobile Capabilities" 6-card grid (which had property AND vehicle services in one grid) removed entirely — was a real violation of the client's own rule, predating this rebuild.

**New catalog** (`lib/hydroblastersCatalogV2.ts`, 55 items) fully replaces the old 140-item one — different structure, different prices for several packages. Added real DB support for a `popular` flag (`bo_service_catalog.popular`, new schema version `v24`) so "Most Popular" badges are genuine data, not hardcoded. Added a `DELETE` handler on the admin catalog route for a true full-replace reseed (POST alone only upserts by slug, which would've left 140 old rows sitting alongside the new 55).

**New interactive UI** (all real, live-tested via Playwright, not just visually checked):
- Package cards: time badge, price, checkmarked inclusions, "Most Popular" badge, Select Package (highlights white when selected, per spec) + Add-On Services buttons
- Add-on modal: checkboxes, live running total per division
- Sticky summary bar (Mobile Detailing, also enabled for Pressure Washing for consistency): package + add-on count + running total + Continue to Details
- Filterable "Our Work" gallery on Pressure Washing (real Unsplash photos per category — not fabricated before/after pairs, since no real job photos exist yet; labeled honestly as illustrative work examples)
- Mobile hamburger nav, 5-item global nav (HOME / HB - PRESSURE WASHING / HB - MOBILE DETAILING / ABOUT / GET QUOTE)
- New brand: navy `#0A1930` bg, electric blue `#00A8FF` accent, Inter body + Montserrat Bold headings, new Hydro hero art (`hydro_forward_side.png`, forward-facing with wand)

**Booking flow**: old Step 1 (category/package dropdowns) removed — package+add-on selection now happens in the division views themselves; "Continue to Details" hands off into the existing Step 2-4 flow (contact info → photos → estimate/confirm) unchanged, still posting to the same real `/api/public/hydroblasters/book` endpoint with the same 72h spacing rule. **Real bug caught before shipping**: `confirmBooking()`'s destructuring bug (`getSelectedItems()` object treated as if it were the items array) would have crashed every submission — caught via type review before the live test, not after.

**Real UX bug fixed via live testing**: the chat widget's fixed bottom-right position overlapped the sticky summary bar's own Continue button, making it unclickable when both were showing at once. Fixed with a `body.sticky-active` class that lifts the chat widget above the sticky bar.

Full flow live-verified end-to-end: selected Marine "Full Detail" ($699), continued via the sticky bar, filled contact info, submitted — real appointment + CRM lead created with the correct $733.95 total (incl. GST), then deleted as test data. Hydro AI confirmed reading the new catalog live (no redeploy needed, it re-reads the DB every message).

## Wordmark sizing pass — 2026-09-02

Follow-up polish after the first wordmark pass: enlarged the mascot icon (44px -> 68px header, 38px -> 56px footer), shrank the "HYDRO BLASTERS" text itself (own explicit font-size instead of inheriting `.logo`'s larger size), added real spacing between the two words (was rendering as one squished "HYDROBLASTERS"), and dropped the trailing ".CA" from both the header and footer logo lockups entirely. Store/client-portal heading instances (which use the same `.brand-wordmark` class inside larger H2s) were left at their own inherited sizes — appropriately large in that context, not affected by the header/footer-specific size overrides.

## Brand wordmark + footer reorganization — 2026-09-02

- **"HYDRO BLASTERS" text styling**: matched the client's own logo art (blue "HYDRO" + light-grey "BLASTERS", bold geometric caps) using the Orbitron Google Font + sampled hex colors (`#1E9EF4` / `#DCDEE2`), applied as real text (`.brand-wordmark` CSS class, not another raster image) everywhere the brand name appears as a title: header logo, footer logo, store page heading, client portal heading. Real text stays crisp at any size, unlike a raster logo graphic (see below).
- **Nav bar moved into the footer**: the "QUICK NAVIGATION" bar (all 6 items, including the Staff/Admin login links) used to sit directly under the header — very prominent for what's really a utility/staff-access strip. Moved it into the footer, right above the copyright line, per the client's explicit request that customers shouldn't see admin/staff access prominently. Had to compensate: the bar used to provide the fixed header's top clearance (`margin-top: 70px`) for every view — moved that clearance onto `.view-container` directly so page content doesn't hide under the fixed header now that the bar isn't there.
- **Social icons added**: Instagram/Facebook/TikTok in the footer, styled as circular icon buttons. **Links are placeholders (`href="#"`) — user said they'll create the pages and provide the real URLs later.** Update these three `<a>` tags in the footer once given.

All confirmed live via Playwright: zero page errors, hero section renders correctly (not hidden under the fixed header), nav bar confirmed present in `footer` and absent from its old top-of-body location, footer screenshot checked visually.

## Real logo + favicon installed — 2026-09-02

User sent real brand art (a "Hydro" mascot — that's the character's actual name, also used for the AI chat persona). Two source files (`Hydro Blasters.png`, opaque dark background; `hydro_blasters_transparent.png`, genuinely alpha-transparent despite rendering pink in some previews — verified via a real pixel/alpha histogram check, not just visually) processed with Pillow: background chroma-keyed out of the full lockup, and the mascot cropped tight (excluding the wordmark, which is illegible at small sizes) into square icon files at 16/32/180/512px. Uploaded to BARIO's media storage (`storage.bario.ca`, public URLs) rather than embedding as base64.

**Where it's used**: real `<link rel="icon">` favicon tags (16/32/512px PNG + 180px apple-touch-icon) in `<head>`; header + footer logo lockup (mascot icon + the existing crisp text wordmark, NOT the full raster logo graphic — tried that first, its baked-in text was illegible squeezed into nav-bar height, reverted to icon+text); Hydro AI chat widget's header avatar. Confirmed live via Playwright: icon `<link>` tags present with correct URLs, logo `<img>` loads at real size, screenshots of header/footer/chat all correct.

## Bario badge removed — 2026-09-01

The free-tier "Built with Bario" badge only comes off when the owning account is on a paid plan AND `sites.show_badge = false` (`hasPaidPlan()` check, enforced server-side in `/api/admin/users/set-badge` too, not just cosmetic). Comped `admin@hydroblasters.ca` onto the `business` hosting plan via `/api/admin/users/grant-plan` (no real Stripe subscription — same "manual comp" mechanism used elsewhere, matches the plan tier that would normally be needed for their already-connected custom domain anyway), then `/api/admin/users/set-badge` with `showBadge: false`. Confirmed live via a fresh (`X-Vercel-Cache: MISS`) fetch and a Playwright screenshot — badge gone from the hero area. Note: the footer text "Powered by Bario One OS Integration Layer" is the *client's own* copy from their original file, not the platform badge — left as-is, wasn't asked to change it.

## Domain cutover (hydroblasters.ca) — DONE 2026-09-01

`connect-domain` run (registrar: "Third Party" — not registered through Vercel/BARIO), user added the two DNS records at their registrar (A `@` -> `76.76.21.21`, CNAME `www` -> `cname.vercel-dns.com`; the Cloudflare-zone/nameserver-delegation half of connect-domain never populated for this domain, `nameservers: null` — didn't matter, the direct-A-record path works fine), `verify-domain` run and returned `verified: true`. Confirmed live via `curl` (both `hydroblasters.ca` and `www.` return `200`) and a real Playwright pass through the booking wizard on the actual production domain (catalog loads, no page errors). `domain_status` is now `'verified'` in the `sites` table.

## Deploy note

The CRM wiring (`ALLOWED_BUSINESS_KEYS` + org id) required a real code change + `vercel --prod` deploy (commit `e4e4a81`, 2026-08-31) — this isn't something the admin API alone can do. If HydroBlasters is ever removed/paused, remove `hydroblasters` from both places in the same two files and redeploy.
