# Source Registry

This document explains why Band on the Map maintains its own source registry,
how it relates to the canonical objects in `docs/ARCHITECTURE.md` and the
rights model in `docs/DATA_RIGHTS.md`, and how the registry is expected to
grow city by city.

Registry files are repository-controlled JSON, not a database. There is no
Supabase dependency, migration, collector, or scheduler introduced by the
registry itself — see "What the registry is not" below.

## Why a registry, separate from any one aggregator

No single third-party aggregator can be assumed to cover a city's live-music
scene completely, cleanly, and with clear reuse rights all at once. AgendaLX,
for example, is the strongest single source found for Lisboa so far — a
structured API with an open licence at the dataset level — but it is scoped
to Lisboa municipality's own cultural agenda. It does not cover Cascais,
Sintra, Oeiras, or the towns south of the Tagus, each of which runs its own
separate, unfederated municipal feed, and as an editorially curated agenda it
does not guarantee inclusion of every small independent venue even within
Lisboa.

The registry exists to hold this wider set of candidate and enabled sources
as first-class, structured, city-agnostic data, so that:

- coverage does not silently collapse to whatever one aggregator happens to
  publish;
- every source's technical suitability and rights status are recorded
  explicitly and separately, instead of being assumed;
- the same source can be re-assessed over time without losing its history;
- Band on the Map can expand into a new city or country by adding a new
  registry file, not by redesigning the model.

## Source vs Event

`docs/ARCHITECTURE.md` defines `Source`, `Observation`, and `Event` as
distinct canonical objects: raw records from a Source become Observations,
and multiple Observations may later resolve into one canonical Event.

A registry entry **is** a `Source` in that sense — but the registry captures
a `Source` earlier in its life than the architecture diagram's "external
permitted sources" box implies. Most registry entries here have not been
ingested from at all yet. The registry is where a `Source` is discovered,
described, and assessed for technical and legal suitability *before* (or
independent of) any ingestion worker ever calling it. Nothing in this task
creates Events, Observations, or Offers; those only ever get created once a
registry entry is `ENABLED` and a collector exists for it, which is future
work.

## Monitoring status, lifecycle stage, and reuse rights are three separate things

Every entry carries three fields that must never be conflated with one
another:

- `monitoring_status` — a **technical finding** about this source:
  `READY_FOR_TECHNICAL_PROOF` (looks technically promising, but has not yet
  been directly exercised), `TECHNICAL_PATH_PROVEN` (the acquisition path
  *has* been directly exercised and validated — a real fetch, a passing
  contract test, a committed fixture — but this still does not imply rights
  clearance, an enabled production collector, or scheduling),
  `NEEDS_TECHNICAL_REVIEW`, `UNSUITABLE_AUTOMATION`, `BLOCKED`, or `UNKNOWN`.
  This is purely about engineering feasibility and evidence: does it expose
  a calendar feed, a stable dated page, or nothing usable at all — and has
  that actually been tried yet.
- `lifecycle_status` — this source's **onboarding stage**
  (`DISCOVERED` → `TECHNICALLY_REVIEWED` → `RIGHTS_REVIEWED` → `ENABLED` →
  `PAUSED`/`RETIRED`, see "Lifecycle" below). This is a process/workflow
  concept: how far this entry has moved through review, not what was found.
- `rights_status` — is Band on the Map *permitted* to collect, store, and
  redisplay this source's data (`GREEN`, `AMBER`, `RED`, `UNKNOWN`, per
  `docs/DATA_RIGHTS.md`)? This is a legal/licensing question, independent of
  how easy the source is to poll or how far it has progressed through the
  lifecycle.

A source can be trivial to monitor (a clean ICS calendar) and still have
unresolved or prohibited rights. A source can have clear rights and still be
technically unsuitable for automation (social-only, blocked, no schedule). A
source's acquisition path can be directly proven (`TECHNICAL_PATH_PROVEN`)
long before its rights are reviewed, or before it is anywhere near
`ENABLED`. None of the three fields ever implies either of the others, and
this registry never upgrades `AMBER`/`UNKNOWN` rights to `GREEN` on the
strength of public accessibility alone — see the "Rights are preliminary"
section below.

**Invariant:** once `lifecycle_status` reaches `TECHNICALLY_REVIEWED` (or
later), `monitoring_status` can no longer be `READY_FOR_TECHNICAL_PROOF` —
reaching that lifecycle stage means the acquisition path has already been
directly proven, so the technical finding must say so
(`TECHNICAL_PATH_PROVEN`, or whatever the proof actually found).
`sources/registry/validate.mjs` enforces this automatically.

## Why one Event may be observed from multiple Sources

The same real-world concert or festival routinely appears on more than one
registry-worthy source at once — for example NOS Alive is promoted by
Everything Is New's own site, listed on AgendaLX, and sold through more than
one ticketing platform. The registry deliberately keeps `overlap_notes` per
entry to record this rather than trying to deduplicate sources against each
other. Overlap is expected and useful: it is exactly why `docs/ARCHITECTURE.md`
resolves multiple Observations into one canonical Event, instead of trusting
any single Source's record as the Event itself. The registry's job stops at
describing sources; Event resolution across sources is separate, later work.

## Rights are preliminary until reviewed

Every `rights_status` recorded here reflects a preliminary research
assessment, not a legal clearance. In particular:

- `AMBER` and `UNKNOWN` must stay `AMBER`/`UNKNOWN` — they are not silently
  promoted to `GREEN` because a page is publicly visible. Public
  accessibility is not redistribution permission (`docs/DATA_RIGHTS.md`).
- Where this repository already has a more specific, previously governed
  rights assessment for a source, that governed evidence takes precedence
  over a newer, broader research report if the two differ. AgendaLX is the
  worked example: `sources/agendalx.json` records `GREEN` (CC BY) for the
  base open-data endpoint, but `docs/sources/AGENDALX.md` separately records
  the specific frontend-evidenced query path used for music retrieval as
  `AMBER`, because that query contract was discovered from website code
  rather than from the dataset's own documentation. The registry entry for
  AgendaLX follows that more specific `AMBER`, not a blanket `GREEN`.
- `rights_notes` and `rights_evidence_url` exist so a later, deliberate
  rights review has somewhere to record its findings without needing to
  re-research from scratch.

`docs/DATA_RIGHTS.md` defines `RED` as "not permitted for automated
ingestion or intended use" — a specific, evidenced prohibition, not a
default. In particular:

- An ordinary "all rights reserved" copyright footer, on its own, does
  **not** establish that automated ingestion is prohibited — it is the
  default legal notice on essentially every website and says nothing
  source-specific about reuse.
- Simply failing to find an open/reuse licence does **not** establish
  `RED` either — absence of evidence for permission is not evidence of
  prohibition.
- `RED` is reserved for entries where the retained evidence shows an
  *actual, specific* prohibition (for example, terms of use that expressly
  forbid automated access, bots, or scraping). Every entry with
  `rights_status: RED` must carry a non-empty `rights_notes` identifying
  that basis; `sources/registry/validate.mjs` enforces this.
- Where the evidence is only a generic copyright footer or a missing
  licence, the correct classification is `UNKNOWN`, with `rights_notes`
  explaining that reuse permission has not yet been established — not that
  it has been established as prohibited.

## AgendaLX: one identity, not two

AgendaLX already had a detailed, governed source contract before this
registry existed (`sources/agendalx.json` and `docs/sources/AGENDALX.md`),
including a live-probed fixture and passing tests. The registry does not
duplicate that as a second, independent source identity. Instead:

- the registry entry uses the same `id: "agendalx"`;
- `detailed_source_ref` points back at `sources/agendalx.json` and
  `docs/sources/AGENDALX.md` as the governing detail;
- where the two would otherwise disagree (rights status of the music query
  path), the existing, more specific governed contract wins.

Any future registry entry for an already-contracted source should follow
this same pattern rather than introducing a second identity for the same
real-world source.

## Research provenance, not a research dump

Registry entries do not embed full research transcripts. Each entry carries
a small `research_provenance` object — `research_id`, `review_date`, and an
optional short `note` — pointing at the research task that produced or last
reassessed it (for this cohort, `BOTM-RESEARCH-LISBON-SOURCES-01`, reviewed
`2026-08-23`). Anything needed to explain a specific decision lives in that
entry's own `research_notes` or `rights_notes`, kept short. The registry is
operational data describing sources, not an archive of how they were found.

## First-wave Lisbon strategy

`BOTM-RESEARCH-LISBON-SOURCES-01` identified 114 credible Lisbon-region
source leads. This task seeds only its **Best First 25** — chosen for a
mixture of event volume, distinctiveness, genre diversity, festivals, and
geographic spread, not simply the 25 largest venues. The remaining ~89 leads
are not committed here; they remain research evidence only, to be seeded in
later, deliberately scoped batches as they are individually reviewed.

Of the 25, six were identified as the most technically promising: entries
whose `acquisition_method` is `API_JSON`, `RSS`, or `ICS_CALENDAR` rather
than an unstructured HTML page. In this cohort that is exactly `agendalx`,
`cm-odivelas-agenda-cultura`, `hot-clube-de-portugal`,
`village-underground-lisboa`, `bota-anjos`, and `forum-luisa-todi` — filter
`sources/lisbon.json` on `acquisition_method` to find them again as the set
grows. Their collectors are **not** built in this task; being a good
technical-proof candidate only means the next step (a bounded collector
proof-of-concept) is worth attempting first.

## City-by-city expansion model

The schema in `sources/registry.schema.json` is intentionally city- and
country-agnostic: `country_code`, `city`, and `municipality` are plain
fields on every entry rather than being baked into file structure or code.
The intended growth pattern is one registry file per city or region — e.g.
`sources/lisbon.json` today, a future `sources/zagreb.json` or
`sources/porto.json` — all validated against the same
`sources/registry.schema.json` contract and the same
`sources/registry/validate.mjs` validator. Adding a new city means adding a
new file and seeding it from that city's own research; it does not require
changing the schema, the validator, or any already-committed city file.

## Lifecycle

Each entry carries a `lifecycle_status`, tracking its own onboarding
progress independently of every other entry:

```text
DISCOVERED -> TECHNICALLY_REVIEWED -> RIGHTS_REVIEWED -> ENABLED -> PAUSED / RETIRED
```

- **DISCOVERED** — identified by research, with a preliminary
  `monitoring_status` and `rights_status`. This is where every entry in this
  first-wave cohort starts, except AgendaLX (see below).
- **TECHNICALLY_REVIEWED** — the acquisition path has been directly proven
  (a real fetch, a passing contract test, a committed fixture), not just
  assessed from research; its `monitoring_status` reflects that
  (`TECHNICAL_PATH_PROVEN`, not `READY_FOR_TECHNICAL_PROOF` — see the
  invariant above). AgendaLX is seeded at this stage because
  `ingestion/agendalx/probe.mjs` and `tests/agendalx-contract.test.mjs`
  already prove its technical path independently of this task; its
  `monitoring_status` is `TECHNICAL_PATH_PROVEN` accordingly, while its
  `rights_status` stays the governed `AMBER` (proving the technical path
  does not review the rights).
- **RIGHTS_REVIEWED** — a deliberate rights review has confirmed
  `rights_status`, per `docs/DATA_RIGHTS.md`, and it is no longer
  preliminary.
- **ENABLED** — both technical and rights review have passed, and a
  scheduled collector exists for this source. No entry in this cohort is
  `ENABLED`; building collectors and scheduling is explicitly out of scope
  here.
- **PAUSED / RETIRED** — temporarily or permanently withdrawn from active
  monitoring (site redesign, venue closure, rights revoked, etc.), without
  deleting its history.

Moving an entry from one stage to the next is always a deliberate, reviewed
action recorded by updating that entry's fields — it never happens
implicitly as a side effect of research alone.

## What the registry is not

To keep this contract's scope clear as it grows:

- It is not a database. It is version-controlled JSON, validated offline.
- It does not implement or schedule any collector.
- It does not create Events, Observations, or Offers.
- It does not make live HTTP requests as part of validation or tests.
- It does not grant reuse rights by inclusion — see "Rights are
  preliminary" above.
