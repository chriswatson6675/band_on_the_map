# london-t2-house-of-sisters-grimm-02

Explanatory only — `investigation.json` is authoritative; this file carries
no independent weight and the validator never reads it.

**Supersedes:** `london-t2-house-of-sisters-grimm-01` (Level 1 triage).

## What this investigation did

Phase B deep-dive activation-readiness investigation for House of Sisters
Grimm (23-25 Eastcastle Street, London W1W 8DF), continuing the prior
Level 1 `PASSIVE_STATIC` triage with a genuine Level 2 `STRUCTURAL` probe:
a single unauthenticated GET of the venue's `/events/` programme index, plus
three individual event detail pages it links to (Sabina Desir: Freedom Road
Re-Imagined — a dated EFG London Jazz Festival booking; African Jazz Nights
at iGOLI Bar — a weekly recurring jazz set; and GLOBAL LANDSCAPES
RETROSPECTIVE — a non-music art exhibition, sampled deliberately to
honestly test the mix).

## What was found

- **No JSON-LD Event/MusicEvent data anywhere.** Every fetched page's only
  structured data is generic Yoast-SEO boilerplate. `acquisition_class:
  STATIC_HTML` is confirmed, not merely carried forward from Level 1.
- **Extraction genuinely works when a date exists.** One full `DIRECT_SOURCE`
  example (GLOBAL LANDSCAPES RETROSPECTIVE states `19 August – 9 September
  2026` outright) and one full `DETERMINISTIC_CONTEXT` example (Sabina
  Desir's own "Date: Tuesday 17 November and Wednesday 18 November" combined
  with the same page's own "Part of EFG London Jazz Festival 2026" /
  "13–22 November 2026") were both reproduced offline and deterministically
  — see `evidence/offline-proof.mjs` and `evidence/offline-proof-output.txt`.
- **The venue's current programme is genuinely, materially mixed** — 3 of
  the 6 events in the "Upcoming & ongoing events" section are non-music (an
  art exhibition, a wine tasting, an art-and-wine experience) against 3 that
  are music. This is *not* the "occasional non-music exception on an
  overwhelmingly-music venue" pattern this project already has a working
  precedent for (`MUSIC_GATE_EXCLUDED_TITLES` in `ingestion/london/run.mjs`,
  built for 100 Club London) — it would need new, materially larger,
  not-yet-authorised human curation.
- **The venue's most substantial recurring music offering (African Jazz
  Nights, weekly) exposes no calendar date at all** — confirmed via a
  literal empty `<div class="lp-intro__date"></div>` element on its own
  detail page.

## Decision: `DEFER`

Per `docs/SOURCE_INVESTIGATION_POLICY.md`, `DEFER` is a legitimate, complete
outcome — not a failure. This venue's live-music relevance is real (INALA,
a Grammy-nominated live-music/dance/storytelling production; a dated EFG
London Jazz Festival booking; a weekly jazz night), and the acquisition
mechanics are genuinely solid where a date exists. What is missing before
`READY_FOR_ACTIVATION` would be honest is (1) an explicitly-authorised,
actively-maintained curation strategy for a genuinely mixed programme, and
(2) a resolved approach to the flagship recurring music listing's total
absence of a calendar date. Neither is invented or papered over here.

This investigation does **not** edit `venues/london.json`, `sources/london.json`,
`venues/source-venue-mappings.json`, or `ingestion/london/run.mjs` — see
"Investigation and activation are separate" in the policy document.
