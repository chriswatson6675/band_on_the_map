# casa-independente-lisbon-02

**Supersedes:** `casa-independente-lisbon-01`. This is a real trial
investigation of a real venue/source candidate — not activation.
`decision.status` here is `READY_FOR_OFFLINE_PROOF`, a research conclusion
only. It does not edit `sources/*.json`, any `venues/*.json` registry, or
public map data. Turning this candidate into an active collector is a
separate, explicitly-authorised step — see "Investigation and activation
are separate" in `docs/SOURCE_INVESTIGATION_POLICY.md`.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## Why this investigation exists

`casa-independente-lisbon-01` (fetched 2026-08-25) reached
`READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION`, because of two
honest gaps:

1. no per-event id and no per-event URL exist anywhere on the source at
   all (a documented alternative composite-key identity strategy exists,
   but is unproven);
2. the retained fetch only ever showed **one** page-level month/year
   heading ("Agosto 2026"). That investigation could not observe how the
   page's structure behaves once the calendar rolls into a new month — does
   a second heading appear? are past events dropped? is the whole page
   replaced? — and explicitly recommended a second observation "after the
   calendar rolls into September 2026" as the way to find out.

By the time this investigation started (2026-08-27, per the task's real
current date), that seemed like a plausible moment to re-check. This
investigation is that re-check.

## What this investigation found

**The month-boundary question is still not resolved — but now for a
mechanically-verified, honest reason, not an open question.**

A fresh, independently-fetched copy of `https://casaindependente.com/agenda/`
on 2026-08-27, plus a second cache-busted fetch (distinct query string,
explicit `Cache-Control: no-cache`, response headers confirming
`X-Cache: MISS` — ruling out a stale CDN artifact), both show:

- still exactly **one** page-level month/year heading: `"Agosto 2026"`;
- still exactly the same **4** events, in the same order, with the same
  weekday/day-month/hour/type/title text as `casa-independente-lisbon-01`'s
  own 2026-08-25 fixture.

`evidence/offline-proof.mjs` mechanically compares the event-relevant
content (heading text + every event block's weekday/day-month/hour/
type/title) between this fresh fixture and the original investigation's own
retained `body-agenda.html`, reading both as local, already-retained
project evidence (never re-fetched, never mutated) — and finds them
**byte-identical**. Two calendar days passed and nothing on the page
changed.

**Why:** `2026-08-27` has not actually crossed into September yet. The
month-boundary question can only be observed once the source's own agenda
page reacts to a real month change — and as of this fetch, it plainly has
not done so (the page is clearly hand-maintained, not necessarily updated
on the first of the month). This investigation could not manufacture that
transition; it could only confirm, with fresh and cache-verified evidence,
that it has not happened yet.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted again, and it was again
**`SUFFICIENT`** — no escalation to Level 2/3/4 was needed. This
investigation's probe ladder starts fresh at Level 1 with its own retained
evidence (per `docs/SOURCE_INVESTIGATION_POLICY.md`'s intent that a probe
history is not backfilled or copied); `casa-independente-lisbon-01`'s own
`probe_history` is cited only as prior context for why Level 1 alone was
expected to be adequate here too.

## What is fresh vs. what is prior context

Every claim in `investigation.json` is backed by evidence retained under
**this** investigation's own `evidence/` directory, fetched on 2026-08-27:

- `body-home.html`, `body-agenda.html`, `body-agenda-cachebust.html`,
  `body-contactos.html`, `body-sobre.html` (and their matching `headers-*`
  files) — all freshly fetched via plain `curl` GETs, never reused from
  `casa-independente-lisbon-01`.
- `offline-proof.mjs` / `offline-proof-output.txt` — a new script for this
  investigation, extending the original's per-event derivation +
  weekday-cross-check logic with three new mechanical checks: (a) a
  cache-busted-fetch consistency check, (b) a byte-for-byte comparison
  against the **original** investigation's own retained fixture (read
  locally as already-governed project evidence, never mutated, no
  network), and (c) a venue single-location check confirming the agenda
  page names no alternate address anywhere in its own markup.

`casa-independente-lisbon-01`'s own `probe_history` is cited once, as
prior context for why Level 1 was expected to suffice again — that is the
only thing taken from the prior record without independent re-verification.

## Real nuances found and honestly recorded (not smoothed over)

- **The page genuinely has not changed in two days.** This is itself
  informative: it suggests the venue updates this page in batches
  (whenever new events are booked/typed in), not on a fixed monthly
  cadence tied to the calendar. A future re-observation timed for early-to-
  mid September, not exactly September 1st, is more likely to actually
  catch a transition.
- **No per-event id or URL exists at all — unchanged.** Re-confirmed
  freshly: still only Elementor internal `data-id` editor-authoring
  artifacts (51 of them on this fetch), never a stable per-event
  identifier; still no per-event `href` among the 18 distinct hrefs on the
  page.
- **The weekday label is still inconsistently formatted** ("SEXTA FEIRA"
  vs "SEXTA" for the same weekday) — re-confirmed on the fresh fetch,
  unchanged from the original.
- **No price and no end time are exposed** for any sampled event, in
  either fetch.
- **`time` is recorded as `PARTIAL`, not `PROVEN`, under v1.2** — a
  deliberate, honest tightening versus `casa-independente-lisbon-01`
  (which recorded `time` as `PROVEN` with `value: null` under v1.1, which
  permitted a null value on a `PROVEN` field). `v1.2`'s
  `validateAssessmentEntryV1_2` requires a non-null `value` whenever
  `state` is `PROVEN`; hour-only precision with no minutes and no
  timezone is not confidently promotable to a precise claimed value, so
  it is recorded `PARTIAL` here instead of manufacturing a value that
  overstates precision.
- **`title` and `start_date` values are recorded as arrays**, not single
  scalars — this field_assessment describes a bounded 4-event sample, not
  one single event, and `v1.2` requires a non-null `value` on every
  `PROVEN` field. The array of 4 sampled titles/dates is the honest,
  non-null representation of what was actually extracted.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script (`node evidence/offline-proof.mjs`) that:

1. re-parses the fresh agenda fixture and confirms exactly one month/year
   heading (still true);
2. re-derives all 4 events' full dates and cross-checks each against the
   source's own weekday label via pure calendar math (4/4 matched);
3. confirms the cache-busted re-fetch parses identically to the primary
   fetch;
4. compares the fresh fixture's event-relevant content, field by field,
   against `casa-independente-lisbon-01`'s own retained 2026-08-25 fixture
   and finds it byte-identical;
5. re-confirms the `source_record_id`/`event_url` gap (no per-event href
   or stable id anywhere on the fresh fixture);
6. re-confirms venue identity (address, email, 1863/2012 dates) from the
   fresh contacts/about/home pages;
7. confirms the fresh agenda page never names any street address or venue
   other than "Largo do Intendente" anywhere in its own markup.

Captured stdout is retained at `evidence/offline-proof-output.txt` and
cited as this investigation's `DETERMINISTIC_DERIVATION` evidence item. It
exited `0` with every check passing.

## Why the decision stays `READY_FOR_OFFLINE_PROOF`

The month-boundary blocker `casa-independente-lisbon-01` raised is **still
open** — this fetch simply could not observe a transition that has not
happened yet on the source's own page. Per the task's own instruction:
*"If the page still only shows one month, or the transition is genuinely
still ambiguous, honestly keep it at `READY_FOR_OFFLINE_PROOF` or
`DEFER`."* This investigation keeps `READY_FOR_OFFLINE_PROOF`, matching
`casa-independente-lisbon-01`'s own conclusion — but this is now a
mechanically re-verified re-confirmation with fresh, cache-checked,
byte-compared evidence, not a default carry-over of the old record.

The `source_record_id`/`event_url` gap remains honestly `NOT_PRESENT`,
with the same documented alternative composite-key identity strategy
(venue + derived ISO date + normalised artist-name slug) — this alone
would structurally satisfy the `READY_FOR_ACTIVATION` gate's "PROVEN OR
alternative strategy documented" condition, but the still-unresolved MAJOR
month-boundary blocker is why this investigation does not recommend
activation regardless.

## What a future investigator/collector-builder should know

- Tentative recommended collector family: `STATIC_EVENT_LIST` — unchanged
  from `casa-independente-lisbon-01`.
- Do not trust the shared `/agenda/` URL as a per-event `event_url` — no
  unique per-event URL exists on this source at all.
- **Re-observe again, but don't assume September 1st is meaningful for
  this source.** The page did not change between 2026-08-25 and
  2026-08-27, suggesting hand-maintained, batch-style updates rather than
  a fixed monthly cadence. A future re-observation should probably wait
  until well into September (or check periodically) rather than fetching
  exactly on the month boundary.
- No `CRITICAL` blockers were found. Two `MAJOR` blockers (no stable
  identity/URL at all; unverified multi-month heading behaviour — both
  re-confirmed, not merely carried over) and two `MINOR` blockers
  (weekday-label formatting drift; no price/end-time data) are recorded in
  `collector_assessment.blockers`.
