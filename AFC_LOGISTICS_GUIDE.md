# AFC Logistics — Access & How-To Reference

Not part of BARIO itself — this is a separate client (logistics dispatch business) hosted on the same Hostinger VPS (`2.25.139.207`). Kept alongside BARIO's own docs since that's where the user's other persistent reference files live this session.

**Site:** https://afclogistics.ca (single-page app — marketing, admin, driver, and customer portals all live in one `index.html`, backed by `afc-backend` on port 4200).

---

## Admin access

You need **two separate unlocks**, in either order (whichever prompts first):

1. **Page passcode** — scroll to the footer → click **Admin** → enter passcode `AFCAdmin2026!` → "Unlock Dashboard". This just gates the page from casual visitors, not real security.
2. **Real staff login** — click **Sign In** (top right) → email `admin@afclogistics.ca`, password `AFCAdmin2026!`. This is the actual account with real data access.

Once both are done, the dashboard shows real stats, the live driver map, jobs, invoices, driver applications, etc. If you only do the passcode without signing in, you'll see a "demo dashboard" placeholder instead of real data.

**What's in the admin dashboard:** stats (drivers/jobs/revenue/driver pay/profit), live driver map, Driver Applications review (Approve/Reject), Add Driver, Create Job (with $/% driver pay), Rate Sheets (each driver's standing pay rate), Change My Password, Reset a Password (for any driver/client), All Jobs, Invoices.

---

## Driver access (once approved)

Drivers use the exact same **Sign In** button (top right) as everyone else — enter the email + password they were given after approval. The site automatically detects their role and takes them straight to the Driver Portal (no manual navigation needed).

**What's in the driver portal:** their own jobs only (never sees other drivers' or customers' data), Accept/Decline new job offers, Mark Picked Up → In Transit → Delivered, upload a Proof-of-Delivery photo, and **live GPS sharing starts automatically** the moment they have an active job — no toggle needed, it just works in the background while that tab/page is open. Also shows their real earnings (YTD, all-time, pending) and full pay history.

**Known gap:** drivers don't currently have a self-service "change my password" option (only admin does, for their own account). Worth adding if you want drivers to be able to change a temp password themselves — not built yet.

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
