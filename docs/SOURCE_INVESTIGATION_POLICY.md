# Source Investigation Policy

Latest policy version: `BOTM-SOURCE-INVESTIGATION-v1.2`
(`BOTM-SOURCE-INVESTIGATION-v1.1` remains independently supported — see
"Policy versioning" below)
Tasks: `BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01`,
`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01A`,
`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01B`,
`BOTM-DIFFICULT-SOURCE-TRIAL-01`,
`BOTM-GIG-FACT-DERIVATION-GOVERNANCE-02`

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
`"17"`, the investigator must not infer `September 17 2026` **merely
because today's date, common sense, or a probable season makes that
convenient** — see "Field-value basis (v1.2)" immediately below for the
one narrow, mechanical exception (deterministic contextual derivation)
this policy actually permits, and why it is not the same thing as
guessing. An `AMBIGUOUS` (or `PARTIAL` / `NOT_PRESENT` / `UNKNOWN`)
field-assessment state must never carry a precise claimed `value` —
`ingestion/source-investigation/contract.mjs` enforces this directly:
`value` may only be non-null when `state` is `PROVEN`.

## Field-value basis (v1.2): deterministic contextual derivation

**Why this exists.** `BOTM-DIFFICULT-SOURCE-TRIAL-01`, the framework's
first real-world trial, exposed a genuine gap: arts and music websites
routinely omit repeated context from individual event cards — a page
heading states `"September 2026"` once and every card beneath it just
says `"17"`; a programme page states `"2026/27 Season"` once and events
say `"12 October"`; a venue's own agenda page never repeats its own name
on every card. Under `v1.1` alone, a precise value effectively needed to
be restated at the individual field/card level to become `PROVEN` — which
is more restrictive than what a human reading the same retained page
would honestly conclude, and pushed investigators toward leaving genuinely
determinable facts as `UNKNOWN`/`PARTIAL` even when the source's own
structure settles them without ambiguity.

**The principle.** *"Not repeated on the event card" does not mean
"unknown" when retained first-party source context determines the value
uniquely.* But — and this is just as important — **"obvious to a human"
alone is not a validation rule.** `v1.2` (`BOTM-GIG-FACT-DERIVATION-
GOVERNANCE-02`) resolves this tension by requiring every `PROVEN`
field-assessment value to carry an explicit `basis`, drawn from a
tightly-controlled vocabulary (`FIELD_BASIS_VALUES` in
`ingestion/source-investigation/contract.mjs`):

- **`DIRECT_SOURCE`** — the exact claimed fact is directly expressed by
  one piece of retained first-party evidence. Example: a retained
  `JSON-LD` block's own `"startDate": "2026-09-17T21:00:00+01:00"`.
- **`DETERMINISTIC_CONTEXT`** — the exact fact is not repeated in the
  field's own immediate location, but is *mechanically, reproducibly*
  combined from **two or more** retained pieces of first-party context.
  Example: a retained page heading stating `"September 2026"` plus a
  retained event card stating `"17"`, combined by a stated, fixed rule,
  yields `2026-09-17` — and nothing else. Requires a `derivation` object
  (see below). Permitted **only** when the derivation has exactly one
  valid result and is reproducible without model judgement.
- **`AI_INFERENCE`** — the value depends on plausibility, common sense,
  interpretation, prediction, or model judgement. Example: *"today is
  August 2026, the card says `17 September`, so it's probably this
  September."* This is **not** production-safe merely because it is
  likely correct — `AI_INFERENCE` can never be the `basis` of a `PROVEN`
  field. A fact whose only basis is inference stays `PARTIAL`,
  `AMBIGUOUS`, or `UNKNOWN`.

**Evidence class vs. field-value basis — do not confuse these.**
`evidence[].evidence_class` (`DIRECT_EVIDENCE` / `DETERMINISTIC_DERIVATION`
/ `AI_INTERPRETATION` / `OPERATOR_DECISION`, unchanged since `v1.1`)
describes **how a piece of retained evidence was obtained**.
`field_assessment.*.basis` describes **how a field's precise value was
established from that evidence**. A `DETERMINISTIC_CONTEXT` field
normally cites `DIRECT_EVIDENCE` items for its raw inputs (the heading,
the card) *and*, where required for activation, a
`DETERMINISTIC_DERIVATION` evidence item proving the combination was
actually reproduced offline — see "Offline derivation proof" below.

**The `derivation` object.** Required, and meaningful, only when `basis`
is `DETERMINISTIC_CONTEXT`:

```json
{
  "state": "PROVEN",
  "value": "2026-09-17",
  "basis": "DETERMINISTIC_CONTEXT",
  "notes": "heading establishes month/year, card establishes day",
  "evidence_refs": ["ev-calendar-heading", "ev-event-card"],
  "derivation": {
    "rule": "the nearest preceding month/year heading governs every event row beneath it until the next heading; concatenate with the row's own day",
    "inputs": ["September 2026", "17"]
  }
}
```

`derivation.rule` must be a non-empty string stating the mechanical
combination rule. `derivation.inputs` must be an array of **at least two**
strings — `DETERMINISTIC_CONTEXT` means combining more than one retained
piece of context; a single ambiguous source is not a combination, and
`contract.mjs` rejects it structurally. A `DIRECT_SOURCE` entry must
**not** carry a populated `derivation` — there is nothing to combine, and
inventing derivation metadata for a fact the source already states
outright is itself a form of dishonesty this policy rejects (see test
`13` in `tests/source-investigation-v1_2.test.mjs`).

**Contextual inheritance works the same way for every field, not just
dates.** The same `basis`/`derivation` model applies to `title`,
`start_date`, `time`, `end`, `venue_location`, `source_record_id`,
`event_url`, and `price` alike:

- *Venue*: a page is the official agenda for "Sala X"; child event cards
  omit the venue. If retained source **structure** proves every child
  event is nested inside that venue's own section (not merely printed
  near it), `venue_location` may be `PROVEN` / `DETERMINISTIC_CONTEXT`.
- *Price*: a section heading states `"Entrada livre"`; every event card
  structurally contained within that section omits its own price. If that
  containment is mechanically provable, `price` may be `PROVEN` /
  `FREE` / `DETERMINISTIC_CONTEXT`.

**Do not over-generalise inheritance beyond what source structure actually
proves.** A venue name appearing once, near the top of a page, with dozens
of unrelated event cards below it, is not automatically inherited by all
of them — the structural containment (or an equivalently explicit,
retained relationship) has to be genuinely demonstrable, not assumed from
visual proximity or general page layout.

**The anti-guessing rule is mechanically limited — read this honestly.**
`contract.mjs` enforces what it structurally *can*: that `basis` is
present only when `PROVEN`, that `AI_INFERENCE` can never be a `PROVEN`
basis, that `DETERMINISTIC_CONTEXT` cites a non-empty rule and at least
two inputs, and — as a best-effort, mechanical safety net — that a
`derivation.rule` does not contain telltale plausibility language ("today",
"probably", "likely", "assume", "obviously", and similar). **It cannot
execute arbitrary domain logic to verify that a given rule genuinely
yields exactly one result**, and a rule text that smuggles in a hidden
reliance on today's date, agent knowledge, venue habit, or an unstated
assumption while avoiding all of those words is a policy violation this
module cannot detect — the same honest limitation this framework already
has for verifying that a site genuinely is a candidate's first-party
official presence. The investigator's own discipline, an accurate
self-labelling of `basis`, and (where required for activation) a genuine
offline reproduction remain load-bearing; the validator is a backstop, not
a proof engine.

**Offline derivation proof.** For a `DETERMINISTIC_CONTEXT` field required
for `READY_FOR_ACTIVATION` (today, `title` and `start_date` — the same
fields `v1.1` already gates), the field's own `evidence_refs` must include
at least one `DETERMINISTIC_DERIVATION` evidence item — a small, bounded,
dependency-free, **no-network** script that re-parses the retained
fixture(s) and reproduces the claimed combination deterministically. This
must never become a production collector; it exists only to prove the
derivation is genuinely reproducible, not merely asserted. See
`research/source-investigations/example-deterministic-context-ready-01/`
for a complete worked example.

**Worked examples:**

| Source context | Claim | Valid? | Basis |
|---|---|---|---|
| `"17 September 2026"` stated directly | `2026-09-17` | ✅ | `DIRECT_SOURCE` |
| Heading `"September 2026"`, card `"17"` | `2026-09-17` | ✅ | `DETERMINISTIC_CONTEXT` |
| Programme states `"2026/27 Season"` + `"October"`, with the source's own explicit, retained season-boundary rule (season N/N+1 runs Sept(N)–Aug(N+1)) | `2026-10-12` | ✅ | `DETERMINISTIC_CONTEXT` (only if the season→year mapping is itself explicit and mechanical, not assumed) |
| Today is August 2026; card says `"17 September"`; no page/section/year context | `2026-09-17` | ❌ | would be `AI_INFERENCE` — stays `AMBIGUOUS`/`UNKNOWN` |
| Heading `"2026/27 Season"`, card `"17"`, no month context | any specific date | ❌ | cannot be determined from retained context alone — stays unresolved |

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

**Under `v1.2`**, gates 4 and 5 (`title`, `start_date`) accept either
`basis: "DIRECT_SOURCE"` or `basis: "DETERMINISTIC_CONTEXT"` — both are
first-class, activation-eligible provenance. `basis: "AI_INFERENCE"` can
never satisfy either gate, and structurally cannot even coexist with
`state: "PROVEN"` in the first place (see "Field-value basis (v1.2)"
above), so an `AI_INFERENCE`-based claim fails validation outright rather
than merely failing the activation gate. Additionally, gate 4/5 fields
whose `basis` is `DETERMINISTIC_CONTEXT` must themselves cite a
`DETERMINISTIC_DERIVATION` evidence item proving the contextual
combination was reproduced offline — a field-specific refinement of gate
9, not a relaxation of it.

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
  `notes`, `evidence_refs` — and, **under `v1.2` only**, `basis`
  (`FIELD_BASIS_VALUES`; non-null only when `state` is `PROVEN`) and
  `derivation` (`{rule, inputs}`; non-null only when `basis` is
  `DETERMINISTIC_CONTEXT`) — see "Field-value basis (v1.2)" above;
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

Under `v1.2`, a `PROVEN` state additionally requires a `basis` —
`FIELD_BASIS_VALUES = DIRECT_SOURCE | DETERMINISTIC_CONTEXT |
AI_INFERENCE` — and `basis` must itself be `DIRECT_SOURCE` or
`DETERMINISTIC_CONTEXT`; `AI_INFERENCE` can never satisfy `PROVEN`. See
"Field-value basis (v1.2)" above for the full model. `v1.1` records have
no `basis` field at all and are never required to add one.

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
- a `policy_version` that is well-formed but not in
  `SUPPORTED_POLICY_VERSIONS` (today, anything other than
  `BOTM-SOURCE-INVESTIGATION-v1.1` or `v1.2`) — see "Policy versioning"
  below;
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
  (`BROWSER_OBSERVATION`) probe;
- **`v1.2` only** — a `PROVEN` field with no `basis`, or a non-`PROVEN`
  field carrying a `basis`; `basis: "AI_INFERENCE"` on any `PROVEN`
  field; `basis: "DETERMINISTIC_CONTEXT"` with no `derivation`, fewer
  than two `derivation.inputs`, or a `derivation.rule` containing
  plausibility language ("today", "probably", "assume", and similar —
  see "Field-value basis (v1.2)" above); a `derivation` populated on a
  `DIRECT_SOURCE` entry; a `READY_FOR_ACTIVATION` gated field with basis
  `DETERMINISTIC_CONTEXT` but no cited `DETERMINISTIC_DERIVATION`
  evidence item.

## Policy versioning

This policy is versioned. Two versions are currently supported side by
side — `BOTM-SOURCE-INVESTIGATION-v1.1` and `BOTM-SOURCE-INVESTIGATION-
v1.2` — each with its own genuine, independently-implemented rule set.
Every investigation record carries its `policy_version`, and
`ingestion/source-investigation/contract.mjs` checks it in two separate
steps that must not be confused with each other:

1. **Shape.** Is the string even well-formed —
   `BOTM-SOURCE-INVESTIGATION-v<major>.<minor>`? This is deliberately
   generic and does not name any one version specifically, because the
   *naming scheme itself* is expected to outlive any one version.
2. **Support.** Is this specific version one the *current validator
   implementation* actually knows how to check? `SUPPORTED_POLICY_VERSIONS`
   in `contract.mjs` answers this — today, `v1.1` and `v1.2`. **A record
   declaring any other version — including an older, perfectly well-formed
   one like `v1.0` — fails validation outright**, with an explicit
   `unsupported policy_version "..." — current validator supports
   BOTM-SOURCE-INVESTIGATION-v1.1, BOTM-SOURCE-INVESTIGATION-v1.2` error.
   It is never silently re-validated under either supported version's
   rules — `validateInvestigation()` dispatches on the *exact* declared
   version to `validateInvestigationV1_1()` or `validateInvestigationV1_2()`
   (see "What `v1.2` support actually required" below); nothing falls
   through from one version's rules to another's.

**Why fail closed instead of reinterpreting.** A validator that accepted
any well-formed `policy_version` string and then applied *today's* rules
to it regardless would be lying about what it checked — a `v1.0` record
would appear to pass "validation" while actually only ever having been
checked against `v1.1`'s requirements (`probe_history` and everything
else added since), which is not what a `v1.0` investigator was ever held
to and not a genuine re-validation of what `v1.0` actually required. Fail
closed instead: an unsupported version is a clearly reported error, not a
silent reinterpretation.

**Historical records remain durable, not silently re-checked.** This is
consistent with "History and supersession" above: an old
`investigation.json` is never rewritten just because the policy moved on.
A `v1.0` record stays exactly as it is, on disk, as part of the
project's history — this validator simply cannot currently re-validate
it under `v1.0`'s own original rules, and says so plainly instead of
guessing.

**What `v1.2` support actually required** (and what any future `v1.3`+
must repeat). Bumping `POLICY_VERSION` (or widening
`SUPPORTED_POLICY_VERSIONS`) on its own would never have been enough, and
must never be done as a shortcut. Genuine coexistence needed
**version-specific validation/dispatch** — implemented explicitly, not
assumed. Concretely, `v1.2` took the second of the two options this
section always documented as legitimate:

- a documented, deliberate decision that a new version's rules are a
  strict superset of / fully compatible with the prior version's, so the
  existing validation function genuinely already implements them
  correctly for both versions (not what `v1.2` did — its field-assessment
  shape genuinely changed), **or**
- dispatching to a version-specific validation function — what `v1.2`
  did: `validateInvestigationV1_1()` and `validateInvestigationV1_2()`
  are two separate, independently-readable functions in `contract.mjs`,
  selected by `record.policy_version` inside the public
  `validateInvestigation()` dispatcher, so each version is checked
  against the rules it actually had. Everything `v1.2` did not
  deliberately change (`probe_history`, `evidence[]`, `identity`,
  `site_classification`, `data_paths`, `collector_assessment`, `decision`,
  activation gates other than the field-basis additions) is implemented
  identically in both functions.

Either way, a new version must be added to `SUPPORTED_POLICY_VERSIONS`
deliberately, alongside its own tests — never by widening
`POLICY_VERSION_PATTERN` or the supported-versions set without that work,
and never by simply pointing an old version's records at new rules.

**`v1.1`** (`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01A`) added the
required `probe_history[]` field and its validation rules (see "Probe
history" above) — a genuine rules change, not just prose, so it shipped
as a new minor version per the rule stated above. The two synthetic
governance fixtures under `research/source-investigations/` were updated
in place to `v1.1` and given real `probe_history` entries, rather than
being superseded, since they are governance test fixtures rather than
real investigation conclusions — see each fixture's own README.md.

**Implementation note** (`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01B`,
still `v1.1`): this task made version *support* explicit.
Previously, any well-formed `policy_version` string validated using
`v1.1`'s rules regardless of its actual value, which contradicted the
"future versions coexist" intent stated above without ever actually
implementing it. `SUPPORTED_POLICY_VERSIONS` closes that gap — see
"Support" above. This did not change what a `v1.1` record itself
requires, only what happens to a record declaring a *different* version,
so it did not warrant its own version bump.

**`v1.2`** (`BOTM-GIG-FACT-DERIVATION-GOVERNANCE-02`) added the
`basis`/`derivation` field-value-provenance model to `field_assessment`
entries — see "Field-value basis (v1.2)" above — a genuine rules change
prompted directly by `BOTM-DIFFICULT-SOURCE-TRIAL-01`, the framework's
first real-world trial, which showed `v1.1` alone was too restrictive for
arts/music sites that establish context once (a month heading, a venue
section, a "free entry" section) rather than repeating it per event.
Implemented as a genuinely separate `validateInvestigationV1_2()`
function, not a widened `v1.1` check — see "What `v1.2` support actually
required" above. `v1.1` records, including the framework's own two
synthetic `v1.1` fixtures and all three real `BOTM-DIFFICULT-SOURCE-
TRIAL-01` investigations (`hard-club-porto-01`, `maus-habitos-porto-01`,
`gulbenkian-lisbon-01`), were **not** edited or upgraded — they remain
exactly as originally recorded, validating under `v1.1`'s original rules
only. A new synthetic `v1.2` fixture,
`research/source-investigations/example-deterministic-context-ready-01/`,
was added instead of retrofitting an existing one. Per "History and
supersession" above, if any `v1.1` investigation is later reconsidered
under `v1.2`, that must be a **new** investigation record whose
`supersedes` field names the original — never a rewrite of it.

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
