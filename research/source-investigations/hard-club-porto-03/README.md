# hard-club-porto-03

This is a **corrective, superseding governed investigation** of Hard Club
(Porto, Portugal), run under `BOTM-SOURCE-INVESTIGATION-v1.2`. It
**supersedes** `research/source-investigations/hard-club-porto-02/`
(`supersedes: "hard-club-porto-02"` in `investigation.json`), which remains
byte-identical and untouched — this is a new record, not a rewrite of the
old one, per "History and supersession" in
`docs/SOURCE_INVESTIGATION_POLICY.md`.

Nothing in this directory changes `sources/*.json`, any `venues/*.json`
registry, `venues/manual-coordinates.json`, public map data, or scheduler
configuration. `investigation.json` records a research conclusion, not an
activation.

## Why this investigation exists

`hard-club-porto-02` reached `READY_FOR_ACTIVATION` and was activated in
`sources/porto.json`. `PORTUGAL-SECOND-PASS-30-40-VENUE-POPULATION-01` then
built a real collector against it, wiring the exact two-step flow -02
documented: bootstrap `/PT/agenda/` for a `PHPSESSID` cookie, then repeat
that cookie on the `load-agenda` AJAX endpoint. On its first live
publication run, this collector failed outright:

```
acquiring hard-club-porto ... FAILED: Expected non-empty Hard Club agenda AJAX fragment HTML
```

Rather than silently loosening the parser or discarding the source, this
investigation re-probed the live endpoint directly to find the actual
cause, and corrects the earlier record's prose.

## What was wrong, and what was actually true

`hard-club-porto-02`'s `field_assessment` blocker prose stated the warm
fragment is returned once the client "repeats that same cookie plus a
Referer header on the AJAX call." That attribution was never isolated
against a control (a request lacking only the cookie, or only the header) —
-02's own Level 2 probe only ever tested one fully-warm request against one
fully-cold request, not the individual headers within the warm request.

Four fresh, isolated live requests (`evidence/case-{a,b,c,d}-*.txt`, all
2026-08-27, produced by the retained, reproducible
`evidence/header-requirement-probe.mjs`) settle the question directly:

| Case | Cookie | Referer | X-Requested-With | Result |
|---|---|---|---|---|
| (a) | ✓ | – | – | HTTP 200, **0-byte body** |
| (b) | ✓ | ✓ | – | HTTP 200, **0-byte body** — falsifies -02's Referer claim |
| (c) | ✓ | – | ✓ | HTTP 200, full 22-event day+month+room fragment (10896 bytes) |
| (d) | – | – | ✓ | HTTP 200, day-of-month only, no month/room (10644 bytes) — reproduces -02's original cold finding |

**Conclusion:** the second required header is `X-Requested-With:
XMLHttpRequest`, not `Referer` (which the endpoint does not check at all).
The warm session cookie remains an independently required condition — case
(c) vs (d) differ only in month/room presence, exactly matching -02's
original warm-vs-cold distinction. This is a same-level (Level 2,
`STRUCTURAL`) correction: no new escalation, no browser used, and no change
to the underlying two-requirement acquisition path or to any other finding
in -02 (identity, `source_record_id`, price path, year-derivation rule,
linked-ticketing analysis — all re-confirmed unchanged and carried forward
verbatim).

## What changed in this record vs. -02

- `probe_history[1]` (Level 2, `SUFFICIENT`) gained a corrective addendum
  and five new `evidence_refs`, in place — no new probe_history entry was
  added, because the schema's escalation-ladder validation does not permit
  a second same-level entry following a `SUFFICIENT` outcome, and this
  correction is not an escalation.
- `field_assessment.*.blockers`' Hard Club session-flow blocker description
  is corrected to name `X-Requested-With: XMLHttpRequest` instead of
  `Referer`.
- `decision.status` is unchanged: `READY_FOR_ACTIVATION`. The source was
  already activated under -02; this record corrects the technical detail a
  real collector needs to actually work, it does not reopen the activation
  decision.
- The collector itself
  (`ingestion/lisbon-porto/run.mjs`'s `collectHardClubPorto()`) was updated
  in the same change to send `X-Requested-With: XMLHttpRequest` on both the
  list and per-event price AJAX calls, and re-verified live.

## Decision

`decision.status: "READY_FOR_ACTIVATION"` — unchanged from `-02`, carried
forward on the same evidenced rationale, now with an accurate technical
description of the exact request shape a collector must send. This package
does not modify `sources/*.json`, any `venues/*.json` registry, manual
coordinates, public map data, or scheduler configuration.
