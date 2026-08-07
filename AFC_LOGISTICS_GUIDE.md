# AFC Logistics — Access & How-To Reference

Not part of BARIO itself — this is a separate client (logistics dispatch business) hosted on the same Hostinger VPS (`2.25.139.207`). Kept alongside BARIO's own docs since that's where the user's other persistent reference files live this session.

**Site:** https://afclogistics.ca (single-page app — marketing, admin, driver, and customer portals all live in one `index.html`, backed by `afc-backend` on port 4200).

---

## Admin access

You need **two separate unlocks**, in either order (whichever prompts first):

1. **Page passcode** — scroll to the footer → click **Admin** → enter passcode `AFCAdmin2026!` → "Unlock Dashboard". This just gates the page from casual visitors, not real security.
2. **Real staff login** — click **Sign In** (top right) → email `admin@afclogistics.ca`, password `AFCAdmin2026!`. This is the actual account with real data access.

Once both are done, the dashboard shows real stats, the live driver map, jobs, invoices, driver applications, etc. If you only do the passcode without signing in, you'll see a "demo dashboard" placeholder instead of real data.

**What's in the admin dashboard:** stats (drivers/jobs/revenue/driver pay/profit), a **new-booking notification bell** (red badge count, top right — polls every 10s, toasts when a new one lands), live driver map, Driver Applications review (Approve/Reject), **Quick Quote** (same real pricing engine as the public site, for quoting a caller over the phone — has a "Use in Create Job" button), Add Driver, Create Job (now with real address autocomplete + weight/unit, auto-prices by distance if you leave Price blank), Rate Sheets (each driver's standing pay rate), Change My Password, Reset a Password (for any driver/client), All Jobs (now shows a **Docs** button per job — pulls up POD photo + delivery signature + any damage reports in one window), Invoices.

**Pricing rates are admin-editable** via `PATCH /api/pricing-settings` (no UI form yet, curl/API only) — rate per km and minimum charge per service tier (standard/rush/direct), plus the weight-surcharge threshold. Current defaults (set 2026-08-06, informed by real Alberta hotshot market research — carriers typically run $2.50–$3.50/loaded km): standard $1.75/km ($150 min), rush $2.25/km ($200 min), direct $3.00/km ($250 min), first 500kg free then $8/100kg surcharge. Tune these based on actual competitor quotes/margins.

---

## Driver access (once approved)

Drivers use the exact same **Sign In** button (top right) as everyone else — enter the email + password they were given after approval. The site automatically detects their role and takes them straight to the Driver Portal (no manual navigation needed).

**What's in the driver portal:** their own jobs only (never sees other drivers' or customers' data), Accept/Decline new job offers, Mark Picked Up → In Transit → Delivered, upload a Proof-of-Delivery photo, **Report Damage** (dropdown of damage types — minor scuff/dent/crack/water/missing item/packaging/other — plus notes and an optional photo, visible to admin via the job's Docs button), **Get Signature** (a signature pad the customer signs on the driver's phone at delivery, with a "received by" name), and **live GPS sharing starts automatically** the moment they have an active job — no toggle needed, it just works in the background while that tab/page is open. Also shows their real earnings (YTD, all-time, pending) and full pay history.

**Known gap:** drivers don't currently have a self-service "change my password" option (only admin does, for their own account). Worth adding if you want drivers to be able to change a temp password themselves — not built yet.

---

## Instant Quote Calculator (customer-facing, home page)

Real distance + weight pricing, built 2026-08-06 — replaced the old fake service+weight-only formula.

- **Address autocomplete** (Photon/OpenStreetMap, free, no API key): type 3+ characters, pick from the dropdown of real matches — same "multiple locations for one business" disambiguation pattern as Google/Uber/Lyft. Picking a suggestion captures real coordinates; typing a plain address without picking one still works (the backend geocodes it server-side as a fallback).
- **kg/lb toggle** next to the weight field — accurate conversion either way (1 kg = 2.20462 lb).
- Submitting calls the real backend (`POST /api/quote`), which geocodes both addresses, gets a real driving distance from OSRM (OpenStreetMap's routing engine, also free/no key), and prices it off the admin-editable rate table above. Shows the real km and the real price — no more fake "$149–$249" ranges.
- Signed-in customers see **Book This Shipment**, which carries the exact quoted price/addresses/weight into the booking form — the price they see is the price they're booked at.
- **A real bug was caught and fixed here**: the first version biased address lookups toward Edmonton, which caused "Calgary, AB" to resolve to a street literally named *Calgary Trail* in Edmonton instead of the actual city 300km away — silently massively undercharging that route. Fixed by dropping the geo-bias for full-address lookups (kept it for the as-you-type suggestions, which should stay Edmonton-first). Verified live: Edmonton → Calgary now correctly shows ~297km.

---

## Test / reference logins (live accounts, safe to reuse for demos)

- **Admin**: `admin@afclogistics.ca` / `AFCAdmin2026!` (+ page passcode above).
- **Driver**: `testdriver@example.com` / `TestDriver2026!` — password set 2026-08-06 specifically so this account is always usable for testing.
- **Customer**: anyone can self-signup free via **Sign In → Sign up** (company name, email, any 6+ char password) — no approval needed, instant access. A real one was verified live during this build: `e2e-test-1786057270@example.com` / `E2ETest2026!`, which has a real booking on it (`AFC-9894`, Edmonton → Calgary) if you want to see an already-populated Customer Portal.

---

## How a driver signs up (applies)

1. On the homepage, they click **Drive For Us** (top nav, mobile menu, or footer).
2. They fill out: name, email, phone, service area, vehicle type/make-model/capacity, license number/class, insurance provider/policy, years of experience, availability, and any notes.
3. Submitting shows a confirmation message — nothing else happens automatically yet, it just sits as a **pending application**.
4. **You** review it: Admin dashboard → **Driver Applications** section (shows a pending count badge) → see all their submitted details → **Approve** or **Reject**.
5. On Approve: a real driver account is created automatically.
   - If SMTP were configured, they'd get an email with their login automatically. **It isn't configured yet**, so instead you'll see their temporary password right there in the dashboard — you need to send it to them yourself (text, call, email manually, however you prefer).
6. They then sign in with that email + temp password and land straight in the Driver Portal, ready to receive job offers.

---

*Keep this updated the same way as `TODO.md`/`ADMIN_GUIDE.md` — if a login, passcode, or flow changes, update this file in the same pass.*
