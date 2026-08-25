# BOTM-DIFFICULT-SOURCE-TRIAL-01 — Cross-Site Trial Summary

Task: `BOTM-DIFFICULT-SOURCE-TRIAL-01`
Date: 2026-08-25
Branch: `work/difficult-source-trial-01`
Policy version applied: `BOTM-SOURCE-INVESTIGATION-v1.1`

This is a **comparison/report document only**. It does not replace, and is
not authoritative over, the three governed investigation records it
summarizes:

- `research/source-investigations/hard-club-porto-01/investigation.json`
- `research/source-investigations/maus-habitos-porto-01/investigation.json`
- `research/source-investigations/gulbenkian-lisbon-01/investigation.json`

Each of those is authoritative for its own target. Where this document and
an `investigation.json` ever appear to disagree, the `investigation.json`
wins.

## Purpose

This was the **first real-world trial** of the governed AI source-
investigation framework (`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01`/`-01A`/
`-01B`), merged onto `main` immediately before this package. Three genuinely
unfamiliar, genuinely difficult Portuguese event sources were investigated
independently, from a live current fetch, under the full escalation ladder,
with no assumption carried in from this repository's own older research
notes about the same three venues. The goal was not to get any of these
venues onto the map — it was to test whether the governance framework
itself can be trusted to reason honestly about a real, messy site.

## Method note

Each investigation was performed by an independent agent instance, working
only from the governance documents (`CLAUDE.md`, `docs/
SOURCE_INVESTIGATION_POLICY.md`, `ingestion/source-investigation/
contract.mjs`) and its own live, current evidence — `curl` for raw HTTP
retrieval (byte-faithful `DIRECT_EVIDENCE`), Playwright MCP browser tools
for genuine Level 3 browser observation only after Levels 1–2 were both
retained `INSUFFICIENT`, and `WebSearch` only as a discovery lead, never as
evidence. Each investigation independently re-verified this repository's
own older notes about the same venue (`sources/porto.json`'s
`hard-club-porto`/`maus-habitos` entries; `docs/
LISBON_PORTO_VENUE_ESTATE_01.md`'s Gulbenkian mention) — see each
investigation's own README.md for exactly where the current live evidence
agreed or disagreed with that older research.

## Results table

| Source | Official source proven? | Highest probe level | Acquisition class | Public data path found? | Collector family | Title | Date | Time | Venue | Stable ID | Offline proof | Decision | Primary blocker | Reusable lesson |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Hard Club** (Porto) | YES (PROVEN/HIGH) | **3** — `BROWSER_OBSERVATION` (`SUFFICIENT`) | `SPA_API_DISCOVERABLE` | YES — session-warmed AJAX list fragment (PUBLIC/CONFIRMED) | `STATIC_EVENT_LIST` (MEDIUM — imperfect fit, see below) | PROVEN | **PARTIAL** (day+month proven; calendar year never stated) | PARTIAL (floating local, no timezone) | PROVEN | PROVEN (URL slug) | **PASS** | `HUMAN_REVIEW` | No calendar year in any structural response (MAJOR) | A **session-bootstrap-then-AJAX-fragment** pattern — reusable beyond this one venue, not a Hard-Club special case |
| **Maus Hábitos** (Porto) | YES (PROVEN/HIGH) | **3** — `BROWSER_OBSERVATION` (`SUFFICIENT`) | `EMBEDDED_JSON` | YES, mechanically — but content is stale | `null` (mechanism sound; withheld due to blocker) | PROVEN | PROVEN | PARTIAL (floating local, no timezone) | PROVEN | PROVEN (URL slug) | **PASS** | `DEFER` | No genuinely current/future event found anywhere checked (CRITICAL) | Technical extractability ≠ activation-readiness — **currency must be a formal gate**, not assumed from a clean parse |
| **Fundação Calouste Gulbenkian** (Lisbon, music programme only) | YES (PROVEN/HIGH) | **1** — `PASSIVE_STATIC` (`SUFFICIENT`) | `JSON_LD_EVENT` | YES — list + detail pages (PUBLIC/CONFIRMED) | `JSON_LD` (HIGH) | PROVEN | PROVEN | PROVEN | PROVEN | PROVEN (with a documented multi-session caveat) | **PASS** | `READY_FOR_ACTIVATION`* | None CRITICAL (3 MINOR) | Standard schema.org `JSON-LD Event`/`MusicEvent` extraction is the **cheapest, most generic, most reusable** family this trial found; the source's own `Concerto`/`Transmissão` taxonomy is itself a reusable pattern for separating music from a large institution's broader programme |

\* `READY_FOR_ACTIVATION` here is a research conclusion recorded inside
`gulbenkian-lisbon-01/investigation.json` only. Per
`docs/SOURCE_INVESTIGATION_POLICY.md`'s activation boundary, it does **not**
activate anything — `sources/lisbon.json` was not touched by this package.

## Answers

**1. Which sites were solved without browser use?**
Only Gulbenkian — Level 1 (`PASSIVE_STATIC`) alone was `SUFFICIENT`. A plain
`curl` of its music-agenda list page plus five detail pages, cross-checked
against each page's own schema.org `JSON-LD`, was enough for a full,
`PROVEN`-everywhere field assessment and a `READY_FOR_ACTIVATION` decision.

**2. Which sites genuinely required browser observation?**
Hard Club and Maus Hábitos — both had a real, retained `INSUFFICIENT`
outcome at both Level 1 and Level 2 before Level 3 was attempted, exactly
as the policy requires. Neither jumped ahead.

**3. Did browser observation reveal a cleaner non-browser acquisition path?**
**Yes, in both cases, though differently.** For Hard Club, Level 3 revealed
the specific missing variable (a session cookie from a prior normal page
load) that the Level 1/2 probes lacked — and that finding was then
independently reproduced with **zero** browser involvement via a two-step
`curl` flow, so the final recommended path needs no persistent browser at
all. For Maus Hábitos, Level 3 didn't unlock a new path — it *confirmed*
that no hidden runtime API call exists beyond what Level 1/2 had already
found (the same stale embedded-JSON content, verified via captured network
traffic), which closed the investigation cleanly rather than leaving an
open "maybe a browser would help" question.

**4. Did any source reach `BROWSER_RENDERED` candidacy?**
**No.** No investigation reached Level 4 (`BROWSER_COLLECTOR_CANDIDATE`),
and no `collector_assessment.recommended_family` is `BROWSER_RENDERED`. In
both cases where Level 3 was reached, it *eliminated* the need for a
persistent browser collector rather than establishing one — the opposite
of the outcome a browser-first approach might have assumed going in.

**5. Did any source `DEFER`?**
Yes — Maus Hábitos. Its acquisition mechanism is genuinely clean and fully
proven offline, but every event found across every path checked (listing
page, embedded-JSON content blob, sitemap.xml's 2,926 entries, a
site-referenced ticketing integration) traces back to content last updated
in 2023, even across an apparent 2026 platform rebuild. `DEFER` was the
honest outcome — not a failure to solve the technical puzzle, but a correct
refusal to recommend activating a source with no current data.

**6. Did any source expose ambiguous/imprecise date-time semantics?**
Yes. Hard Club's `start_date` is `PARTIAL` — day and abbreviated month are
reliably present, but no structural response ever states a calendar year,
and the investigation explicitly declined to infer one from URL-slug
suffixes or list ordering. Both Hard Club's and Maus Hábitos's `time`
fields are `PARTIAL` — a floating local time with no stated timezone.
Gulbenkian's date/time are `PROVEN` as *precise local values the source
itself states*, with the same honest floating-local caveat (no UTC offset
claimed) — a different, more complete case, not an ambiguous one.

**7. Did any source lack a provable stable ID?**
No — all three reached `source_record_id: PROVEN`, each via the URL-slug-
as-canonical-path reasoning `docs/SOURCE_INVESTIGATION_POLICY.md`'s stable-
identifier rule permits, each with its own documented caveat (Hard Club:
the `data-rel` numeric attribute looks stable but is a resettable pagination
index and must never be used instead; Gulbenkian: multi-session productions
share one ID and the investigation documents a proposed composite-key
alternative for that specific shape).

**8. Which EXISTING collector families appear reusable?**
`JSON_LD` — directly, cleanly reusable, proven end-to-end against
Gulbenkian with zero source-specific hacks. `STATIC_EVENT_LIST` was
recommended for Hard Club but only at `MEDIUM` confidence — the resolved
path (a two-step, session-gated AJAX *HTML fragment*, not a plain static
list) is a reasonable-but-imperfect fit for that family name, which is
itself useful signal (see Q9).

**9. Which NEW collector capability would unlock the greatest number of
future venues?**
A generic **session-bootstrap-then-AJAX-fragment** acquisition capability:
(1) GET a normal page to establish whatever session/cookie state the site
sets, (2) GET a first-party AJAX endpoint the page's own public JS
references, replaying that cookie and a `Referer` header, (3) parse the
returned HTML/JSON fragment. This is exactly what unlocked Hard Club, and
it is a strong candidate to generalize — small, bespoke, non-CMS PHP venue
sites (a common pattern across Porto's smaller venues per this project's
own existing `sources/porto.json` cohort) plausibly gate their own AJAX
content the same referrer/session-dependent way. This is a genuinely
reusable acquisition *pattern*, not a Hard-Club-specific scraper — see
"Generalisation" below. A secondary, lower-priority candidate is a
reusable **`bond-frontend`/`bndlyr.com` embedded-JSON extraction**
capability — already proven technically viable against Maus Hábitos and
plausibly applicable to the sibling venues (`Serralves`, `agenda-vila-do-
conde`) this repository's own `sources/porto.json` already recorded as
sharing the identical platform fingerprint — but its value is currently
capped by the currency problem found here, not by extractability.

**10. What did the investigation framework prevent the agent from doing
that an unconstrained scraper-building task might otherwise have done?**
- Prevented **inventing a calendar year** for Hard Club from list order or
  a suggestive URL-slug suffix — the policy's explicit date/time rule was
  cited directly as the reason not to.
- Prevented **treating a stable-looking numeric attribute
  (`data-rel`) as a stable ID** merely because it looked like one — the
  stable-identifier rule forced an actual stability check, which the
  numeric attribute failed and the URL slug passed.
- Prevented **jumping straight to browser/headless work**: both Hard Club
  and Maus Hábitos earned Level 3 the hard way, with two real, evidenced
  `INSUFFICIENT` levels first — the framework's sequential/escalation-
  justification rules made a shortcut structurally impossible to validate.
- Prevented **conflating "the parser works" with "this source is ready"**
  for Maus Hábitos — a fully-passing offline proof against a technically
  clean mechanism still correctly produced `DEFER`, because currency is a
  separate, explicit question the framework does not let a clean parse
  paper over.
- Prevented **silently trusting this repository's own older research** —
  every prior conclusion (Hard Club's day-only ambiguity, Maus Hábitos's
  "no discoverable JSON" claim, Gulbenkian's blocked-403 note) was
  independently re-tested against fresh evidence, and two of the three were
  found to be materially incomplete or outdated today; every discrepancy is
  recorded honestly rather than silently reconciled.
- Prevented **claiming `HEADLESS_REQUIRED`/`BROWSER_RENDERED` without
  proof** — the validator's cross-check would have rejected either claim
  without a retained Level 3 entry, and none of these investigations needed
  to test that boundary because none reached for it dishonestly.
- Prevented **any material conclusion from existing only as agent prose** —
  every finding above traces to a cited, retained, on-disk evidence file
  under each investigation's own `evidence/` directory, checked by
  `npm run validate:source-investigations`, not just asserted in a final
  report.

## Generalisation review

Per this task's explicit instruction, the goal is a city-portable *system*,
not three venue-specific scrapers. Restated in those terms:

| Finding | Source-specific framing (rejected) | Reusable framing (adopted) |
|---|---|---|
| Hard Club | "Hard Club scraper" | `SESSION_BOOTSTRAP_AJAX_FRAGMENT` — a candidate reusable acquisition capability: warm a session with a normal page load, replay its cookie + Referer against a first-party AJAX endpoint the page's own JS references, parse the returned fragment. Worth prototyping once against 2–3 more small bespoke-PHP Porto venues before treating it as a named family. |
| Maus Hábitos | "Maus Hábitos special case" | The generic **embedded-JSON bootstrap-data extraction pattern** for the `bond-frontend`/`bndlyr.com` platform family is real and already proven reusable — this trial's contribution is establishing that a **currency/freshness check belongs in the governed lifecycle as a first-class gate**, applicable to *any* future source, not just this one. |
| Gulbenkian | "Gulbenkian scraper" | Confirms `JSON_LD` as a genuinely mature, low-effort, high-confidence reusable family for any WordPress-or-similar site that emits schema.org `Event`/`MusicEvent` blocks — and confirms that **using a source's own explicit event-category taxonomy** (rather than AI classification) is the correct, reusable way to separate music from a large institution's broader programme. |

Only one source-specific fact was genuinely unavoidable in all three cases:
each venue's own concrete URL, endpoint shape, and field markup had to be
discovered fresh — that is inherent to investigating any new site and is
exactly what the governed investigation process exists to do safely and
repeatably, city by city.

## Repository safety

This package changed nothing under `sources/*.json`, `venues/*.json`,
`venues/manual-coordinates.json`, or `data/public/*`. No collector was
added under `ingestion/`. No source was activated. No scheduler work was
started. Only three new governed investigation directories were created,
plus this summary document.
