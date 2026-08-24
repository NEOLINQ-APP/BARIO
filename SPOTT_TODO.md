# Spott.ca — Task List

Tasks specific to **spott.ca** (marketing, leads, ops) — separate from Spott's own engineering backlog (which lives in the `spott-ca` repo itself) and from BARIO's own engineering backlog in `TODO.md`.

**How this works:**
- Add items here any time, in plain language — doesn't need to be formatted.
- Claude checks this file each session and can work through it.
- **Before taking any real-world action** (sending an email, posting to social, calling an API that changes something live, spending money, etc.), Claude will ask you first and describe exactly what it's about to do. Once you say go, it proceeds without re-asking for that same approved task.
- Check items off yourself with `[x]` any time you handle something outside a session — Claude will also check things off once it completes an approved task.

## Open
- [ ] Continue AFC/Sunbuilt intro-outreach batches on Spott's CRM-outreach system — real candidates remain (~24-26 more AFC, ~21-23 more Sunbuilt as of 2026-08-24). Blocked on the Mailcow deliverability issue, see BARIO `TODO.md`'s Blocked section.
- [ ] Business-email research is incomplete — 745 of 1,062 unclaimed listings have a real researched email as of 2026-08-24; ~317 still don't. Resuming `scripts_scratch/spott-full-research-openai-v3.js` (resumable) would close the gap.
- [ ] Claim-listing campaign's day-3/7/14 follow-up drip has no cron registered (`vercel.json` has no `crons` key) — invitations sent so far (now real, via Resend) won't get automatic follow-ups without either a real cron or continued manual triggers.
- [ ] 7 real Alberta freight-broker leads (Steele's, JORI, Cole International, FMi, Farrow, CoreFreight, Bull's Logistics) were added to both Spott listings and AFC's CRM 2026-08-2x with tailored outreach — check whether any have responded.

## Done
- [x] Notification email dispatcher switched from Brevo (never worked, sender never verified) to Resend (spott.ca already verified) — 2026-08-24, confirmed delivering.
