# BARIO — Architectural & Product Decisions

A scannable log of *why*, not *what/when* (that's `TODO.md`'s job — see
that file for status, bugs, and a dated changelog-by-example). Add an
entry here whenever a real judgment call gets made that a future session
might otherwise re-litigate or reverse without knowing the reasoning
behind it. Keep entries honest and specific — don't record something
generic enough to apply to any project.

---

### DECISION-001 — This file + `TODO.md` are the persistent memory system, not a new `docs/` folder

**Decision:** Extend `CLAUDE.md`/`TODO.md` (both already actively
maintained, repo-committed, real) rather than fork into a parallel
`docs/PROJECT_MEMORY.md`/`PROJECT_STATUS.md`/`TASKS.md`/`BUGS.md`/
`CHANGELOG.md` structure.

**Reason:** `TODO.md` already tracks task status, known bugs, and a
dated changelog inline, in real day-to-day use — a second parallel set of
files covering the same ground would need double-maintenance discipline
every session and would drift out of sync in practice, which is worse
than not having the extra structure at all. This file (`DECISIONS.md`)
is the one genuinely new addition, since neither existing file had a
dedicated, scannable home for architectural reasoning specifically.

---

### DECISION-002 — Sky's AI pipeline is Luna-primary + Gemini-backup-and-reviewer, not a symmetrical multi-model setup

**Decision:** `app/api/builder/generate/route.ts` runs Luna
(`gpt-5.6-luna`) as the sole generator; Gemini only steps in if Luna
fails outright (backup) or reviews Luna's successful output before it
ships (reviewer) — it never generates in parallel or gets asked to vote/
compare against Luna's result for a normal request.

**Reason:** User's own explicit spec for this pipeline (2026-08-21,
via a pipeline diagram: Luna = Primary Builder, Gemini = Backup/
Reviewer). Running both in parallel on every request would roughly
double cost and latency for no benefit on the (common) case where Luna
already succeeded cleanly.

---

### DECISION-003 — Victoria's Unique Group Inc. phone line runs OpenAI's Luna, not Gemini

**Decision:** After building a full Gemini pilot for this line, it was
paused (not deleted) in favor of OpenAI's `gpt-5.6-luna`.

**Reason:** Not a quality judgment against Gemini — the pilot hit a real
Cloudflare L7 DDoS/bot-mitigation block on its specific proxy path that
persisted even against a genuine follow-up call, and couldn't be cleared
in-session. Luna on a brand-new, never-hammered proxy path worked
immediately, turned out cheaper than both Gemini 3 Flash and Claude
Haiku, and the user's own real-world assessment after testing was that
it sounded smoother. Re-enabling Gemini on this line needs the Cloudflare
block confirmed clear via a fresh live call first — see `TODO.md`.

---

### DECISION-004 — Sky's contrast QA uses deterministic math against the known stylesheet, not browser automation

**Decision:** `lib/contrastCheck.ts` computes real WCAG contrast ratios
by reading `theme.primary`/`theme.accent`/`theme.backgroundStyle` against
the fixed, known color pairs already in `lib/renderSite.ts`'s
`EXPORT_CSS` — no headless browser, screenshots, or DOM inspection.

**Reason:** Sky's sections all render from ONE static, known stylesheet
per site (only the theme values vary), so every text/background pair
that could ever fail is enumerable ahead of time — real browser
automation would solve a more general problem (arbitrary generated code/
layout) that Sky doesn't actually have, at real infrastructure cost this
narrower approach avoids entirely. If Sky's rendering model ever stops
being "fixed stylesheet + theme variables," this approach needs
revisiting — it doesn't generalize to arbitrary layout/CSS.

---

### DECISION-005 — `send_sms`'s "text the caller" path never lets any model retype a phone number

**Decision:** `executeTool()`'s `send_sms` branch (shared across every
Victoria provider) resolves "text the caller" via the literal token
`"self"`, which the server maps to the real, verified number from
`callInfo` — never a number the model writes out itself. Non-privileged
callers are hard-capped in code to their own number regardless of what
the model supplies.

**Reason:** A real incident (2026-08-21): asked to text himself a number
he'd just looked up, Gemini filled `toNumber` with an unrelated real
phone number from context instead of the caller's own — a real message
reached a real third party. The fix isn't "trust the model more" or
"switch providers" — it's that no model should ever be asked to
transcribe a phone number from memory when the server already knows it
with certainty.

---

### DECISION-006 — Sky's "vague human language" handling is scoped to its actual output levers, not generic web-design vocabulary

**Decision:** Sky's system prompt now explicitly treats requests like
"make it nicer" or "this feels crowded" as valid instructions, but
translates them only through levers Sky actually has: style preset,
theme colors/background style, copywriting quality, section choice/
order/density, and image search phrases.

**Reason:** Sky is a fixed-schema section/theme generator, not an
arbitrary-code generator — it has no CSS/spacing/animation levers to
reach for, unlike a general-purpose code-writing AI. Prompting it with
generic "consider typography, spacing, shadows, animations" guidance
(as a broader spec proposed) would describe levers it structurally
cannot pull, and risks it fabricating an explanation for a change it
didn't actually make.
