# Source Investigation Policy

Policy version: `BOTM-SOURCE-INVESTIGATION-v1.1`
Tasks: `BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01`,
`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01A`

This is the canonical, human-readable policy governing how AI (or a human)
may investigate an event-source or venue-calendar candidate — a website,
feed, or platform that might become a new Band on the Map `Source` (see
`docs/ARCHITECTURE.md`) — before any collector is built or any source is
activated.

It is framework/governance only. It does not investigate a real venue or
source, does not add a collector, and does not change what the public map
shows. Its machine-checkable counterpart is
`ingestion/source-investigation/contract.mjs` (the record shape and its
structural/business-rule validation) and
`ingestion/source-investigation/validate.mjs` (the repository-level
validator, run via `npm run validate:source-investigations`).

## What is an investigation?

An investigation is a bounded, evidenced research process that answers one
question about one candidate source: **can Band on the Map acquire this
candidate's event data automatically, honestly, and safely — and if so,
how?**

It produces one durable, structured record (an *investigation.json*, see
"The investigation record" below) that captures what was found, what
evidence supports each finding, and a controlled decision about what
happens next. It never produces a running collector, and it never edits
`sources/*.json`, any `venues/*.json` registry, or public map data — see
"Investigation and activation are separate" below.

## What counts as evidence?

Evidence is retained, provenance-tracked material that a claim can be
traced back to. Four classes exist, and a record must classify every piece
of evidence as exactly one of them:

| Class | Meaning |
|---|---|
| `DIRECT_EVIDENCE` | Retained material actually received from, or directly describing, the source (a saved HTTP response body, a downloaded feed, a screenshot of a public page). |
| `DETERMINISTIC_DERIVATION` | A reproducible, mechanical conclusion computed from retained evidence (e.g. re-parsing a retained fixture and getting the same fields every time). |
| `AI_INTERPRETATION` | A model's inference or recommendation, based on cited retained evidence — never itself raw source material. |
| `OPERATOR_DECISION` | An explicit human approval or override, where the policy requires one. |

**`AI_INTERPRETATION` must never masquerade as `DIRECT_EVIDENCE`.** An
AI-written summary of a page is not raw evidence of what the page says,
even if it is accurate — the underlying retained material is the evidence;
the summary is, at best, `AI_INTERPRETATION` built on top of it. This
mirrors a finding already logged in this repository's own research (see
`docs/LISBON_PORTO_VENUE_ESTATE_01.md` §9's `AI_SUMMARIZED_FETCH_UNVERIFIED`
handling of Hard Club): an AI-generated page summary was retained honestly
as low-confidence, unverified evidence, never promoted to a trusted parsed
fact.

Examples of what is, and is not, byte-faithful:

- a byte-retained HTTP response body → may be recorded `byte_faithful: true`;
- parsed/re-serialized JSON → useful structured evidence, but not
  byte-faithful (see `docs/OBSERVATION_PIPELINE.md`'s AgendaLX section for
  the same distinction already established for Observations);
- a browser DOM snapshot → rendered evidence, not the original HTTP bytes;
- an AI-generated summary → never raw evidence, and never byte-faithful.

Every evidence item must record: what was acquired, from where, when, how,
its content type (if known), whether it is byte-faithful, and its evidence
class. Evidence capture is deliberately **bounded** — this policy does not
require or reward huge assets or uncontrolled full-site dumps.

## What may AI infer?

Within a cited evidence trail, AI may:

- classify a site's acquisition method and platform (`site_classification`);
- propose which `field_assessment` state (`PROVEN` / `PARTIAL` /
  `AMBIGUOUS` / `NOT_PRESENT` / `UNKNOWN`) each field honestly reaches;
- recommend a collector family, or say a new one is required;
- recommend a decision (`READY_FOR_OFFLINE_PROOF`, `READY_FOR_ACTIVATION`,
  `DEFER`, `HUMAN_REVIEW`, `REJECT`).

Every one of these is `AI_INTERPRETATION`: a recommendation grounded in
cited evidence, not a fact in itself. It is retained transparently, not
treated as ground truth.

## What may AI NOT infer?

This policy explicitly prohibits:

- inventing missing dates, years, times, or timezones;
- inventing venue identities;
- inventing stable record IDs;
- assuming a field is stable merely because it *looks* stable (see "The
  stable identifier rule" below);
- treating an AI-generated webpage summary as raw source evidence;
- silently using low-confidence AI interpretation as source fact;
- defeating CAPTCHAs, bypassing authentication or paywalls, using
  stolen/private/session credentials, or evading explicit access controls;
- brute-force probing or destructive requests;
- posting forms or otherwise changing source-site state;
- using private APIs not publicly exposed by the site;
- treating a third-party aggregator as first-party authority for a fact
  unless a later, explicit policy says otherwise (see "Third-party sources"
  below);
- activating a source solely because a sample "looks right";
- silently changing acquisition strategy after activation;
- modifying public map data, canonical venue registries, manual
  coordinates, or existing source facts during an investigation, merely to
  make parsing easier.

## The investigation lifecycle

An investigation must move through these stages in order. It must never
jump directly from "found a URL" to "here is collector code" — every
intermediate stage exists to force honest, evidenced reasoning before a
decision is made.

```text
 1. CANDIDATE_IDENTITY          what/where is the candidate, and is this
                                 genuinely its own official presence?
 2. PASSIVE_PROBE               inspect what a plain, unauthenticated
                                 request already exposes (Level 1)
 3. PLATFORM_CLASSIFICATION     identify CMS/framework/acquisition class
 4. DATA_PATH_DISCOVERY         find a stable public feed/API/JSON path
                                 (Level 1/2, escalate to Level 3 only if
                                 needed)
 5. BOUNDED_SAMPLE               capture a small, bounded, real sample
 6. EVIDENCE_RETENTION           persist that sample + its provenance
                                 under research/source-investigations/
 7. FIELD_ASSESSMENT             honestly classify what each field
                                 (title/date/time/end/venue/id/url/price)
                                 actually resolves to
 8. COLLECTOR_FAMILY_ASSESSMENT  recommend a known family, or say a new
                                 one is required
 9. OFFLINE_PROOF                prove a parse/sample works offline,
                                 deterministically, against the retained
                                 fixture — no live network call
10. DECISION                    reach one controlled decision status
```

## The escalation ladder

Cheapest and safest first. Each level is only used if the level before it
genuinely could not answer the question. **As of `v1.1`
(`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01A`), this is not only
human-readable policy — it is machine-recorded and machine-validated.**
Every investigation carries a required `probe_history[]` array (see
"Probe history" below), and `validateInvestigation()` in
`ingestion/source-investigation/contract.mjs` mechanically rejects a
record that skips a level, escalates without justification, or keeps
escalating after a level already answered the question. **An
investigation that jumps directly to browser/headless observation, with
no retained Level 1/2 attempt, cannot validate — regardless of how
otherwise well-evidenced the rest of the record is.**

**Level 1 — Passive / static** (`PASSIVE_STATIC`). Inspect what a plain,
unauthenticated request already exposes: the HTTP response, HTML,
headers, links, JSON-LD, RSS, ICS, embedded structured data, scripts,
known CMS/plugin fingerprints, static event cards. Every investigation's
`probe_history[0]` must be this level — there is no other legitimate
starting point.

**Level 2 — Structural** (`STRUCTURAL`). If Level 1 is insufficient:
identify the CMS/framework, inspect public JS/bootstrap data and
page-data blobs, inspect publicly-referenced endpoints, and determine
whether a stable public JSON/feed/API exists.

**Level 3 — Browser observation** (`BROWSER_OBSERVATION`). If static
inspection cannot expose the event data: use a controlled browser/headless
session to observe the *public* page and its network activity. The
primary purpose is to **discover the stable underlying data path** — not
to make the browser itself the permanent collector. Cannot occur unless
Levels 1 and 2 are both retained in `probe_history` with outcome
`INSUFFICIENT`.

**Level 4 — Browser collector candidate** (`BROWSER_COLLECTOR_CANDIDATE`).
Only when no cleaner public path exists and browser acquisition is
genuinely necessary. This remains higher-cost and must be explicit in the
record, not a quiet default. Cannot occur unless Levels 1, 2, and 3 are
all retained in `probe_history` with outcome `INSUFFICIENT`.

**Level 5 — Defer.** If reliable, honest automated acquisition cannot be
established safely: **`DEFER`**. This is a valid, successful investigation
outcome — not a failure to be avoided or a gap to be papered over by
guessing. `DEFER` is a `decision.status`, deliberately **not** a
`probe_history` level — see "DEFER does not require exhausting the
ladder" below.

### Probe history

`probe_history` is a required, ordered array — one entry per escalation
attempt — proving the ladder was actually followed, not merely described
afterwards. Each entry:

```json
{
  "level": 1,
  "method": "PASSIVE_STATIC",
  "outcome": "INSUFFICIENT",
  "reason": "Initial HTML contains only an empty client-rendered shell.",
  "evidence_refs": ["ev-initial-html"]
}
```

- `level` — `1`–`4`, matching the ladder above.
- `method` — must be the exact method name for that level
  (`PROBE_LEVEL_METHODS` in `contract.mjs`: `1` → `PASSIVE_STATIC`,
  `2` → `STRUCTURAL`, `3` → `BROWSER_OBSERVATION`,
  `4` → `BROWSER_COLLECTOR_CANDIDATE`).
- `outcome` — one of:
  - **`SUFFICIENT`** — this level exposed enough information to continue
    the investigation without escalating further. **Terminates
    escalation**: no later `probe_history` entry may follow.
  - **`INSUFFICIENT`** — the method was genuinely tried but could not
    establish the required information. This is the *only* outcome that
    justifies escalating to the next level.
  - **`BLOCKED`** — the investigation hit a legitimate boundary (an
    explicit access control, a challenge, or a similar condition). **Also
    terminates escalation** — `BLOCKED` is not permission to try a more
    aggressive method; the correct next step is normally `DEFER` or
    `HUMAN_REVIEW`, per the forbidden-behaviour rules above (never defeat
    a CAPTCHA, bypass access controls, etc. to get past a `BLOCKED`
    finding).
- `reason` — non-empty; why this level was attempted and, for entry
  index > 0, why the previous level was insufficient.
- `evidence_refs` — non-empty; resolves through the same governed
  evidence model as everything else (see "What counts as evidence?" and
  "Evidence references" — a probe reason with no cited evidence is exactly
  the kind of unpersisted claim the no-scratchpad rule already prohibits).

**Mechanically enforced rules** (`validateInvestigation()`):

1. `probe_history` is required and non-empty.
2. `probe_history[0]` must be `level: 1`, `method: "PASSIVE_STATIC"`.
3. Levels are strictly sequential — entry `i`'s level must be exactly the
   previous entry's level `+ 1`. `1`, `1 → 2`, `1 → 2 → 3`, and
   `1 → 2 → 3 → 4` are the only valid level sequences; `2` alone,
   `1 → 3`, and `1 → 2 → 4` all fail.
4. `method` must correspond exactly to `level`.
5. `outcome` must be a controlled value; `reason` and `evidence_refs` are
   both required and non-empty on every entry.
6. An entry may only follow a level whose `outcome` was `INSUFFICIENT` —
   a `SUFFICIENT` or `BLOCKED` level terminates the sequence; anything
   after one fails validation.

Together, rules 2–4 and 6 are what make Levels 3 and 4's prerequisites
self-enforcing: reaching `level: 3` in a valid record is only possible
via a retained `1 (INSUFFICIENT) → 2 (INSUFFICIENT) → 3` chain, and
`level: 4` only via `1 → 2 → 3`, all `INSUFFICIENT`, before it.

### DEFER does not require exhausting the ladder

`decision.status: "DEFER"` never requires reaching, or even attempting,
every level. `probe_history` may legitimately be as short as a single
`BLOCKED` (or `INSUFFICIENT`) Level 1 entry followed by `DEFER` — the
ladder means escalation is *available when justified*, not that every
investigation must climb it to the top. Do not force an agent to open a
browser session merely to *prove* it tried everything before deferring.

### Cross-checks against the claimed classification

A classification that implies a certain escalation level actually
occurred is checked against `probe_history`, not taken on faith:

- `site_classification.acquisition_class: "HEADLESS_REQUIRED"` requires
  at least one `probe_history` entry with `level >= 3`.
- `collector_assessment.recommended_family: "BROWSER_RENDERED"` requires
  the same.

Ordinary classifications (`STATIC_HTML`, `ICS`, `JSON_LD_EVENT`,
`PUBLIC_JSON_API`, etc.) never require browser probing — these
cross-checks only fire for the classifications that specifically claim
browser-only acquisition was necessary.

## The stable identifier rule

A value that *looks like* an ID is not automatically stable — this
repository already learned this the hard way with Hot Clube de Portugal's
ICS `UID`, which regenerates on every download of the same event (see
`docs/OBSERVATION_PIPELINE.md`). A source-record identifier may only be
marked `field_assessment.source_record_id.state: "PROVEN"` when its
stability is:

- documented by the source itself, **or**
- proven empirically (e.g. repeated acquisition of the same record
  returning the same ID), **or**
- derived from a deterministic source property whose own stability is
  itself evidenced (e.g. a permalink URL slug the source uses as its own
  canonical path).

Otherwise it stays `UNKNOWN` or `NOT_PROVEN` (`PARTIAL`/`AMBIGUOUS` as
appropriate). An investigation must never silently fall back to a random
hash as a substitute identity strategy; if `source_record_id` cannot be
proven, the investigation must say so honestly in
`field_assessment.source_record_id.notes` rather than inventing one.

## The date/time rule

Retain the same honesty already established for Observations (see
`docs/OBSERVATION_PIPELINE.md`'s `start`/`end` certainty model). Record
exactly what the source genuinely exposes — a full UTC instant, a local
datetime with timezone, a floating local datetime, a date only, text only,
an ambiguous day/month/year, or nothing at all. If a page shows only
`"17"`, the investigator must not infer `September 17 2026` because
surrounding context makes that convenient. An `AMBIGUOUS` (or `PARTIAL` /
`NOT_PRESENT` / `UNKNOWN`) field-assessment state must never carry a
precise claimed `value` — `ingestion/source-investigation/contract.mjs`
enforces this directly: `value` may only be non-null when `state` is
`PROVEN`.

## Third-party sources

A clear distinction: **discovery lead** vs. **source authority**. Search
engines, directories, Songkick, Resident Advisor, social pages, ticketing
sites, and blogs may help *discover* a venue or source candidate. They
must not automatically become authority for that candidate's first-party
facts (its own dates, prices, identifiers). Where third-party factual use
is allowed at all, it must be explicitly classified and governed
elsewhere — this policy does not resolve that broader rights question (see
`docs/DATA_RIGHTS.md` for the separate, existing rights framework).

## The no-scratchpad governance rule

**This is the most important operational rule in this policy.**

No material source-investigation finding may exist *only* in:

- an agent scratchpad;
- a temporary directory;
- a terminal transcript;
- conversation/chat context;
- an agent's final report;
- an untracked local file;
- an ephemeral browser session.

Scratchpads may be used for **temporary, mechanical working notes** during
an investigation — trying a query, checking a response shape, iterating on
a selector. But before an investigation is considered complete, **every
material fact or conclusion used in the investigation's decision must be
persisted in the governed investigation record and/or its retained
evidence**, under `research/source-investigations/<investigation-id>/`.

Material findings include (non-exhaustively): official source identity,
platform/CMS classification, a discovered API/feed/ICS endpoint, event
data fields, a stable-ID claim, date/time semantics, bot/challenge
behaviour, source limitations, a collector-family recommendation, an
acquisition blocker, and the activation/defer decision itself. **A
probe/escalation attempt and its reason are material findings too**: "I
tried static acquisition and it didn't work" in a scratchpad or an agent's
final report is not sufficient — that reasoning must be a real
`probe_history` entry in `investigation.json`, citing real evidence, or it
did not happen as far as this framework is concerned. `probe_history`
cannot be backfilled with a fictitious escalation sequence after the fact
to make an otherwise-shortcut investigation validate; see "Probe history"
above for exactly what is mechanically checked.

**Why:** an agent's final report and a scratchpad file both disappear —
literally (scratchpads are ephemeral working space, not durable storage)
and functionally (a chat transcript is not something a future
investigation, a validator, or a teammate can query, cite, or trust). If a
finding cannot be persisted with evidence and provenance, it cannot be the
basis for `READY_FOR_ACTIVATION`, or indeed for any decision at all — an
unpersisted "finding" is not a finding this framework recognises.

**Where must findings live?** Under the governed repository location,
`research/source-investigations/<investigation-id>/` — never under
`scratchpad/`, `tmp/`, `temp/`, an OS temp directory, `node_modules/`, a
build output directory, or any other ephemeral/untracked location.
`ingestion/source-investigation/contract.mjs`'s `isGovernedEvidencePath()`
and `ingestion/source-investigation/validate.mjs`'s file-existence check
enforce this mechanically — an evidence reference pointing anywhere else
fails validation outright (see "Validator" below), and path naming alone
is treated as a strong signal, not the sole guarantee, of durability: the
validator also confirms the referenced file genuinely exists in the
repository, not merely that its name looks safe.

## Investigation and activation are separate

Investigation and activation are **deliberately, structurally separate
actions.**

An investigation may reach the decision `READY_FOR_ACTIVATION`. That
status describes a *research conclusion* — it does **not** update
`sources/*.json`, any `venues/*.json` registry, or any other live
registry. Reaching `READY_FOR_ACTIVATION` inside an
`investigation.json` file changes nothing about what Band on the Map
actually collects.

Turning a `READY_FOR_ACTIVATION` investigation into an enabled source is a
**separate, explicitly-authorised action or package**, outside this
framework's scope, following whatever process the project defines for
registry admission (see `docs/SOURCE_REGISTRY.md`'s `lifecycle_status`
progression).

**Why:** this prevents an AI investigator from being both the judge and
the publisher of its own research. An investigation that recommends
activation is still just a recommendation, evidenced and reviewable, until
a separate step deliberately acts on it.

## Activation gates

`decision.status: "READY_FOR_ACTIVATION"` requires, at minimum, all of the
following — enforced mechanically by `validateInvestigation()` in
`ingestion/source-investigation/contract.mjs`:

1. official/source identity sufficiently established — `identity.status`
   is `PROVEN`;
2. a public acquisition path established — `site_classification
   .acquisition_class` is a resolved, supported class (not `UNKNOWN`,
   `AMBIGUOUS`, or `UNSUPPORTED`);
3. a bounded sample retained — at least one `data_paths` entry with
   `access: "PUBLIC"` and `status: "CONFIRMED"`;
4. event title extraction proven — `field_assessment.title.state` is
   `PROVEN`;
5. event timing semantics honestly understood —
   `field_assessment.start_date.state` is not `UNKNOWN`/`NOT_PRESENT`
   (it may honestly be `AMBIGUOUS`, but it must have been assessed, not
   left blank);
6. stable source-record identity proven, or an explicit alternative
   identity strategy documented — `field_assessment.source_record_id
   .state` is `PROVEN`, or its `notes` documents the alternative strategy;
7. a collector-family recommendation, or an explicit new-family
   requirement — `collector_assessment.recommended_family` is a known
   family or `"NEW_FAMILY_REQUIRED"`, never left `null`;
8. provenance retained — at least one item in `evidence[]`;
9. the parser/adapter proven offline against fixtures — at least one
   `evidence[]` item with `evidence_class: "DETERMINISTIC_DERIVATION"`;
10. no unresolved `CRITICAL` blocker in `collector_assessment.blockers`;
11. `decision.evidence_refs` cites supporting evidence, not just prose;
12. the investigation validator (`npm run validate:source-investigations`)
    passes.

Optional fields the source genuinely does not provide (e.g. `price`,
which per `ALL_FIELD_ASSESSMENT_KEYS` is the only field allowed to be
entirely omitted) are never required for activation.

Gate 12 ("the investigation validator passes") already subsumes every
`probe_history` rule in "Probe history" above — a record cannot reach
`READY_FOR_ACTIVATION` at all if its escalation history is missing,
skips a level, or claims `HEADLESS_REQUIRED`/`BROWSER_RENDERED` without a
retained Level 3 probe.

## The investigation record

Machine shape: `ingestion/source-investigation/contract.mjs`
(`validateInvestigation()`). Storage location:
`research/source-investigations/<investigation-id>/`:

```text
research/source-investigations/<investigation-id>/
    investigation.json   <- authoritative structured state
    README.md            <- explanatory only, never authoritative
    evidence/
        ...               <- bounded, retained evidence files
```

`investigation.json` is authoritative. `README.md` explains it to a human
reader; it carries no independent authority, and the validator never reads
it. Evidence references (`evidence_refs`, and each `evidence[].path`) must
resolve to real entries/files — a dangling reference, or a reference into
a scratch/temp path, fails validation (see "Validator" below).

The record's top-level shape (exact field names live in
`ingestion/source-investigation/contract.mjs`, refined there as
implementation detail; this is the durable concept):

- `investigation_id`, `policy_version`, `investigated_at`, `investigator`
  (`type` + `method`);
- `probe_history[]` — required, ordered escalation-ladder record; see
  "Probe history" above;
- `source_candidate_id` / `source_id` (nullable — set once a
  `sources/*.json` entry exists);
- `venue_reference`, `official_url`;
- `identity` — `status` (`FIELD_STATES`), `confidence`, `evidence_refs`;
- `site_classification` — `acquisition_class` (`ACQUISITION_CLASSES`),
  `platform`, `confidence`, `evidence_refs`;
- `data_paths[]` — `kind`, `url`, `access` (`PUBLIC`/`PRIVATE`/`UNKNOWN`),
  `status` (`CANDIDATE`/`CONFIRMED`/`REJECTED`/`UNKNOWN`), `confidence`,
  `evidence_refs`;
- `field_assessment` — one entry per `FIELD_ASSESSMENT_KEYS` (`title`,
  `start_date`, `time`, `end`, `venue_location`, `source_record_id`,
  `event_url`) plus the optional `price`, each an object with `state`
  (`FIELD_STATES`), `value` (non-null only when `state` is `PROVEN`),
  `notes`, `evidence_refs`;
- `collector_assessment` — `recommended_family` (nullable;
  `COLLECTOR_FAMILIES` member or `"NEW_FAMILY_REQUIRED"`), `confidence`,
  `evidence_refs`, `blockers[]` (`severity` + `description`);
- `decision` — `status` (`DECISION_STATUSES`), `reasons[]`,
  `evidence_refs`;
- `evidence[]` — `evidence_id`, `evidence_class`, `description`,
  `acquired_from`, `acquired_at`, `method`, `content_type`,
  `byte_faithful`, `path`;
- `supersedes` — a prior `investigation_id`, or `null` (see "History and
  supersession" below).

### Field-assessment states

`FIELD_STATES = PROVEN | PARTIAL | AMBIGUOUS | NOT_PRESENT | UNKNOWN`.
`UNKNOWN` (genuinely not yet resolved) and `NOT_PRESENT` (the source
genuinely does not expose this fact) are both first-class outcomes — never
collapsed into each other or into "failure".

### Site/acquisition classification

`ACQUISITION_CLASSES = ICS | RSS | JSON_LD_EVENT | STATIC_HTML |
EMBEDDED_JSON | PUBLIC_JSON_API | WORDPRESS | KNOWN_CALENDAR_PLUGIN |
CLIENT_RENDERED | SPA_API_DISCOVERABLE | HEADLESS_REQUIRED | SOCIAL_ONLY |
TICKETING_ONLY | AMBIGUOUS | UNSUPPORTED | UNKNOWN`.

This is *investigation classification*, not a list of implemented
collectors — several of these values (e.g. `SOCIAL_ONLY`, `UNSUPPORTED`)
describe a candidate this framework explicitly does not build automation
for.

### Collector families

A collector family is a *reusable acquisition pattern* a future
implementation may recognise across many sources — e.g. `ICS_CALENDAR`,
`JSON_LD`, `JSON_API`, `STATIC_EVENT_LIST`, `STABLE_EVENT_PAGE`,
`WORDPRESS_CALENDAR`, `EVENTON`, `SQUARESPACE_ICS`, `BROWSER_RENDERED`.
This package documents the concept and lets an investigation cite one, or
say `"NEW_FAMILY_REQUIRED"` — it implements none of them. Building a new
collector is separate, later work.

### Decision vocabulary

`DECISION_STATUSES = READY_FOR_OFFLINE_PROOF | READY_FOR_ACTIVATION |
DEFER | HUMAN_REVIEW | REJECT`. This is a tightly-controlled vocabulary —
the validator rejects any other value. `DEFER` is a legitimate, complete,
successful outcome (see "The escalation ladder" above), not a failure
state.

## History and supersession

Investigations are not silently overwriteable conclusions. A later
investigation of the same candidate must be recorded as a **new
investigation** (a new `investigation_id`, its own directory), with
`supersedes` pointing at the `investigation_id` it replaces — never by
rewriting the earlier record's `investigation.json` in place and
pretending the earlier conclusion never existed. This package establishes
the principle; a future implementation may add tooling around it (e.g. an
index of supersession chains) without changing the principle itself.

## Validator

`ingestion/source-investigation/contract.mjs`'s `validateInvestigation()`
is the pure, offline, structural/business-rule layer (vocabulary
membership, required fields, state/value consistency, dangling
evidence-reference detection, activation-gate enforcement). It never
touches the filesystem or network.

`ingestion/source-investigation/validate.mjs` adds the one check that
needs real filesystem access — does every `evidence[].path` actually
resolve to a retained file on disk? — and provides the repository-level
CLI: `npm run validate:source-investigations` walks every
`research/source-investigations/<id>/investigation.json` in the
repository and fails (non-zero exit) if any record has any error. Neither
module makes network requests or mutates any file.

Both layers together reject, among other things:

- `READY_FOR_ACTIVATION` with no retained evidence;
- an evidence reference pointing at a nonexistent file;
- `HIGH` confidence with zero supporting evidence refs;
- a stable-ID claim (`source_record_id.state: "PROVEN"`) with no
  supporting evidence;
- an exact date/time `value` claimed while `state` is `AMBIGUOUS` (or any
  non-`PROVEN` state);
- `AI_INTERPRETATION` evidence marked `byte_faithful: true`;
- `READY_FOR_ACTIVATION` alongside an unresolved `CRITICAL` blocker;
- a missing `investigated_at` timestamp or `policy_version`;
- an unknown decision, evidence-class, or acquisition-classification
  value;
- a malformed URL where a URL is required;
- an evidence path targeting a scratchpad/temp/build-output location
  instead of `research/source-investigations/`;
- a missing or empty `probe_history`, or one that does not start at
  level 1;
- a `probe_history` level that skips ahead (e.g. `1 → 3`) or whose
  `method` doesn't match its `level`;
- a `probe_history` entry following a level whose `outcome` was
  `SUFFICIENT` or `BLOCKED` (escalation without justification);
- a `probe_history` entry with an unknown `outcome`, an empty `reason`,
  or no `evidence_refs`;
- `acquisition_class: "HEADLESS_REQUIRED"` or
  `recommended_family: "BROWSER_RENDERED"` with no retained Level 3
  (`BROWSER_OBSERVATION`) probe.

## Policy versioning

This policy is versioned (`BOTM-SOURCE-INVESTIGATION-v1.1`). Every
investigation record carries its `policy_version`.
`ingestion/source-investigation/contract.mjs` validates the *shape* of
that string (`BOTM-SOURCE-INVESTIGATION-v<major>.<minor>`) rather than
pinning to one exact current value, so a future policy version can be
introduced — and coexist with records written under an earlier one —
without every existing investigation becoming invalid overnight. A
version that changes validation *rules*, not just prose, should ship as a
new minor/major version with its own note in this document.

**`v1.1`** (`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01A`) added the
required `probe_history[]` field and its validation rules (see "Probe
history" above) — a genuine rules change, not just prose, so it shipped
as a new minor version per the rule stated above. The two synthetic
governance fixtures under `research/source-investigations/` were updated
in place to `v1.1` and given real `probe_history` entries, rather than
being superseded, since they are governance test fixtures rather than
real investigation conclusions — see each fixture's own README.md.

## How this supports arbitrary city/town onboarding

None of the vocabulary, contract, or validator in this package names a
city, country, venue, or source. The lifecycle
(`CANDIDATE_IDENTITY` → ... → `DECISION`), the escalation ladder, and the
evidence/decision model are all candidate-agnostic — exactly like
`sources/registry.schema.json` is city-agnostic (see
`docs/SOURCE_REGISTRY.md`'s "City-by-city expansion model"). A future
city-onboarding system can point this same governed investigation process
at an unfamiliar venue website in a new city or country and get the same
structured guarantees: no fabricated dates, no unproven stable IDs, no
material finding trapped in a scratchpad, and no investigation that
silently activates itself. Expanding to a new city means running more
investigations under this same policy, not inventing a new one per city.
