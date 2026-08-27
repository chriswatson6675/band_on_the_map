# Investigation: Agenda Vila do Conde

**Status:** `READY_FOR_ACTIVATION` (research conclusion only — this record does
not edit `sources/porto.json` or any registry; see
`docs/SOURCE_INVESTIGATION_POLICY.md`'s "Investigation and activation are
separate").

`investigation.json` is authoritative. This file is explanatory only and
carries no independent authority — the validator never reads it.

## What this investigated

`sources/porto.json` already carries a loose lead for this candidate
(`id: "agenda-vila-do-conde"`, `source_type: "CITY_FEED"`,
`events_url: "https://agenda.cm-viladoconde.pt/en/calendario/"`,
`monitoring_status: "NEEDS_TECHNICAL_REVIEW"`) with a research note stating
no server-rendered event markup or JSON/API endpoint was found in an earlier,
bounded search. This investigation re-examined that exact `events_url`
directly — on its own distinct subdomain (`agenda.cm-viladoconde.pt`, not the
municipality's main `www.cm-viladoconde.pt` site) — as a full, governed,
`BOTM-SOURCE-INVESTIGATION-v1.2` investigation, and reached a **different,
more favourable** conclusion than that prior note.

## What was found

- The `agenda.` subdomain is a distinct calendar CMS (Bond Habits /
  bond-frontend, the same platform family already investigated for
  `maus-habitos-porto-01` and `serralves-porto-01`). Its own static HTML
  renders filter taxonomy, but the events grid itself is genuinely
  client-fetched at runtime (a `"Carregar..."` / Loading placeholder is
  present, not event cards).
- Unlike the maus-habitos/serralves precedent (where the actual per-event
  data was already embedded in the page's static content payload), here that
  static payload holds only taxonomy. The real, current, dated event records
  are served by a **separate, public, unauthenticated JSON POST API** on a
  different host: `https://repeater.bondlayer.com/fetch`. This investigation
  reconstructed the platform's own runtime request (by reading its publicly
  shipped, unminified-enough JS source — `struct.js` for the repeater config,
  `player.js` for the endpoint and payload shape) and queried it with plain
  `curl`, retrieving **29 real, current, future-window event records** across
  2 pages, including one occurring the day after this investigation.
- The events collection carries a genuine, first-party, 16-value controlled
  tag taxonomy (`ref_tags_1o_nivel`) that includes a literal **"Concerto"**
  tag — exactly the kind of mechanical category filter this project already
  relies on for `ingestion/cm-gaia-eventos/discovery.mjs`'s own `"música"`
  tag. **4 of the 29 retained records are genuinely tagged Concerto**:
  Ivandro, Roda de Samba, Smells Like 90's, and Vox Cordis | Itinerários.
- `title`, `start_date`, `time`, `venue_location`, `source_record_id`,
  `event_url`, and `price` are all `PROVEN`/`DIRECT_SOURCE` for the sampled
  Concerto records — no `DETERMINISTIC_CONTEXT` derivation was even needed,
  since the source states a full date+time directly per record.
- **Honest caveat carried into `field_assessment.time`/`start_date`:** the
  source's own `datetime_start_date` field carries a trailing `"Z"` (UTC)
  suffix, but this investigation's own retained evidence (an independent
  free-text local-time field on every sampled record, matching exactly)
  proves that suffix is **not** a genuine UTC instant — it is a floating
  Europe/Lisbon wall-clock time. This is disclosed plainly rather than
  silently corrected or trusted at face value; see
  `collector_assessment.blockers` (MINOR) for what a future collector must
  do about it.
- A genuine, in-scope privacy finding: the same public content endpoint also
  serves an unrelated "users" collection carrying real email addresses and
  password hashes for organisation accounts on this platform. This is a
  vendor-side over-exposure unrelated to this investigation's own question.
  It was disclosed honestly and **redacted before any evidence was
  retained** — see `ev-content-blob-redacted`'s description in
  `investigation.json` and `evidence/content-blob-REDACTED.js`.

## Escalation ladder actually followed

1. **Level 1 (`PASSIVE_STATIC`) — INSUFFICIENT.** Plain GET of the given
   `events_url`: no JSON-LD, no RSS/ICS, an empty events grid. A bounded set
   of common feed/API paths (`/feed`, `/rss`, `/ics`, `/api`, `/wp-json`,
   `?format=json`) was also tried directly per this task's instruction — none
   exposed real feed/API content.
2. **Level 2 (`STRUCTURAL`) — SUFFICIENT.** Fetched the page's own
   publicly-referenced JS bootstrap assets, found the real runtime API
   endpoint and its request shape, reconstructed and issued that request with
   plain `curl`, and fully answered identity, platform classification,
   data-path discovery, and field/content assessment. No browser/headless
   session (Level 3) was needed or opened.

## Evidence and offline proof

All evidence lives under `evidence/`, cited by `evidence_id` from
`investigation.json`. `evidence/offline-proof.mjs` is a dependency-free,
no-network script that re-parses every retained fixture and mechanically
reproduces every material claim in this record (17 checks, all passing) —
run it with:

```sh
node research/source-investigations/agenda-vila-do-conde-01/evidence/offline-proof.mjs
```

`struct.js` and `player.js` (1.3MB and 856KB respectively) were fetched but
are **not** retained in full — only bounded, decisive excerpts
(`struct-js-events-repeater-config-excerpt.txt`,
`player-js-fetch-endpoint-excerpt.txt`) are kept, per this policy's
evidence-capture boundedness principle.

## What this investigation does NOT do

- It does not edit `sources/porto.json`, any `venues/*.json` registry,
  `venues/manual-coordinates.json`, or any `data/public/*` file.
- It does not build or wire up a collector. Turning this `READY_FOR_ACTIVATION`
  conclusion into an active source (updating the existing
  `agenda-vila-do-conde` registry entry, adding a real collector such as
  `ingestion/agenda-vila-do-conde/`) is a separate, explicitly-authorised
  action outside this investigation's scope.
