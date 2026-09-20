# UK Major-Event Venue Census

BeatMapped's first **national** census of major event infrastructure. It
answers *what the large venues are, where they are, how large they are,
what kind of events they host, what official calendars exist, what
powers those calendars, and how ready each is for acquisition* — before
any acquisition begins.

This is a **research artifact, not a production registry.** Nothing in
this census is an admitted venue or an activated source. The census code
(`ingestion/major-event-census/`) cannot import any production registry,
admission, publication or deployment path, and a test asserts that.

## Why this exists

The earlier expansion model pursued exhaustive small-venue coverage
city by city. The strategy is now **major event infrastructure first**:
establish the UK's large scheduled-activity estate (sport, conferences,
conventions, exhibitions, trade shows, concerts, large performing arts),
then descend into the long tail later.

## Inclusion rule

A venue qualifies when it is a **permanent or regularly-operated UK
event venue** meeting one of the following.

### A. Spectator / audience venues — capacity >= 1,000

Capacity means **maximum normal public event / spectator / audience
capacity**. It explicitly does *not* mean emergency occupancy, theoretical
site footprint, or a one-off temporary festival capacity.

Includes arenas, stadiums (football, rugby, cricket), major indoor sports
halls, racecourses, motorsport circuits with scheduled spectator events,
large concert halls, large theatres, large auditoria and large
multi-purpose event halls.

### B. Conference / convention / exhibition venues — the scale exception

This infrastructure often has no single meaningful "venue capacity". Such
a venue qualifies when **either**:

- at least one principal conference space or auditorium holds >= 1,000
  delegates; **or**
- it is clearly major convention/exhibition infrastructure operating at a
  scale where one seated-capacity figure is not meaningful.

For these, the census records `largest_room_capacity`,
`total_event_space_sqm`, `exhibition_space_sqm` and the venue's own
`scale_description` where available. **A synthetic single capacity is
never fabricated to force such a venue through rule A.** These records
carry `inclusion_basis: MAJOR_CONVENTION_EXHIBITION_INFRASTRUCTURE`.

### B2. Major sporting infrastructure — the racecourse/circuit exception

Racecourses, motorsport circuits and greyhound stadiums are major
permanent event infrastructure that mostly does **not** publish a single
seated capacity. Census-01 flagged 92 of them `CAPACITY_REVIEW_REQUIRED`
as a result, which understated the estate rather than describing it.

Such a venue may instead be admitted on `MAJOR_SPORTING_INFRASTRUCTURE`.
The qualifying evidence is a **cited public fixture/race calendar** —
positive proof that it actually stages public events.

It is deliberately **not** `scale_description`. An earlier draft of this
rule keyed off that field, which admitted racecourses whose researcher had
written *"No capacity figure published"* — a sentence recording the
**absence** of evidence. Admitting on that turns the exception into a way
to admit any uncertain venue. The exception is also confined to those
three venue classes.

This basis does **not** assert a proven >= 1,000 capacity. It asserts
documented major sporting infrastructure, and is counted separately from
`CAPACITY_THRESHOLD_MET` for exactly that reason.

### C. Multi-use complexes

A complex may contain several named halls or arenas. The census
represents the **parent complex** and its **major sub-venues** separately
where their public calendars or capacities are meaningfully distinct,
while avoiding double-counting one physical room under several commercial
labels.

## Exclusions

Out of scope: venues with known capacity below 1,000; ordinary pubs, bars
and clubs below threshold; small arts centres; small community halls;
ordinary hotel meeting rooms; temporary pop-ups; one-off festival fields
with no persistent venue identity; private corporate spaces with no
meaningful public or business event programme; closed venues; proposed
venues not yet operational; and historical venues no longer operating.

A major conference or exhibition facility is **not** excluded merely for
lacking conventional spectator seating — that is exactly what rule B is
for.

## Capacity evidence

Every capacity figure carries its own evidence record
(`capacity-evidence.json`): value, type, configuration, **source URL**,
source authority grade, observation date and confidence.

Authority grades (Phase 8):

| Grade | Meaning |
| --- | --- |
| `GRADE_A` | Official venue, operator, club, governing body, local authority, or official convention documentation |
| `GRADE_B` | Reputable industry body, established venue directory, reputable trade publication |
| `GRADE_C` | Secondary corroboration only |

Two rules are enforced in code, not merely by convention:

1. **A stated capacity number with no cited source is automatically
   downgraded to `CAPACITY_REVIEW_REQUIRED`**, whatever confidence the
   researcher claimed — and a venue cannot then be admitted on
   `CAPACITY_THRESHOLD_MET`.
2. **Differing configurations are never collapsed.** A 15,000 concert
   capacity and a 12,000 seated sports capacity are retained as separate
   evidence records (one principal, others additional), never averaged or
   merged into one unexplained number.
3. **Exactly one capacity per venue is principal.** A venue found by
   several workstreams arrives with several competing principal figures.
   Compilation elects one, ranked by *evidence quality* — a sourced number
   beats an unsourced or missing one, then authority grade, then stated
   confidence. **Capacity value is only ever a tie-break**, so the census
   can never prefer a figure merely because it is the largest. Losing
   claims are demoted to additional records, never deleted, and
   `venues_with_conflicting_capacity_claims` counts the venues whose
   researchers genuinely disagreed. Without this the headline capacity
   would be whichever record happened to compile last.

Where capacity is probably >= 1,000 but not adequately proven, the venue
is retained with `inclusion_basis: CAPACITY_REVIEW_REQUIRED` rather than
silently admitted or silently dropped.

## Identity

Venue identity is deterministic (`createVenueCensusId`) and
reconciliation is conservative in **both** directions:

- Venues are **never merged** merely because they share an operator, a
  booking domain, or one complex.
- One venue is **never split** merely because researchers formatted its
  name differently.
- Genuinely ambiguous cases (same name and city, but different official
  sites) are flagged `identity_review` with a reason, never silently
  resolved either way.

### Quarantined official URLs

A recorded `official_url` sometimes turns out not to belong to its venue
at all — a lapsed club domain re-registered as gambling or casino spam, a
defunct predecessor club's site, or a research-tooling artifact.

Such a URL is **quarantined, never deleted**:

| Field | Meaning |
| --- | --- |
| `official_url_quarantined` | the URL proven not to belong to the venue |
| `official_url_quarantine_reason` | what it actually serves, as observed |
| `official_url_status` | `OFFICIAL_URL_VERIFIED`, `OFFICIAL_URL_REPLACED` or `OFFICIAL_URL_REVIEW_REQUIRED` |

Validation enforces that a quarantined URL is never also the current
`official_url`, that it carries a reason, and that a quarantined venue is
never still marked verified. A merge cannot reinstate a quarantined URL
from a second researcher who still had the bad value.

A replacement is accepted **only** on strong evidence. "No trustworthy
replacement found" (`OFFICIAL_URL_REVIEW_REQUIRED`) is a legitimate
outcome — a domain is never treated as official merely because its name
resembles the venue.

## Calendar sources

A venue may have several official calendars, each classified by what it
publishes: `SPORT_FIXTURES`, `CONCERTS`, `CONFERENCES`, `CONVENTIONS`,
`EXHIBITIONS`, `TRADE_SHOWS`, `PUBLIC_SHOWS`, `PERFORMING_ARTS`,
`OTHER_MAJOR_EVENTS`.

A **"hire our venue" / "book an event with us" page is not a calendar.**
Only a surface listing actual forthcoming named events counts. First-party
calendars are preferred; third-party listings may support discovery but
never silently replace first-party truth.

## Source families and acquisition readiness

Each calendar URL is fingerprinted by the **same** engine the production
acquisition path uses (`fingerprintProgrammeSurface` /
`routeCollectorCapability`), so a readiness claim here means the same
thing it would mean in the real pipeline.

| Readiness | Meaning |
| --- | --- |
| `READY_TIER1` | Existing deterministic capability applies with no new engineering |
| `READY_WITH_CONFIGURATION` | Existing reusable capability, needs configuration/wiring |
| `TIER2_REUSABLE_FAMILY` | Needs bounded reusable capability work |
| `TIER3_BROWSER_OR_COMPLEX` | Client-rendered, difficult or access-limited |
| `NO_PUBLIC_CALENDAR` | No meaningful public recurring source located |
| `SOURCE_REVIEW_REQUIRED` | Evidence insufficient or ambiguous (including unreachable) |

**A source is never called ready because it returned HTTP 200.** Readiness
is derived from what the fingerprint engine structurally detected.

### The source-family audit

Fingerprinting alone over-states reusability. A page whose only
`application/json` script is the WordPress emoji settings block is not a
reusable data surface, but it fingerprinted as `OTHER_EMBEDDED_APP_STATE`
— which is why Census-01 had to report `TIER2_REUSABLE_FAMILY` as an
**upper bound** rather than a count.

`audit-source-families.mjs` converts that bound into a measured number.
Every source in a family that feeds the TIER2 headline is re-fetched once
and checked against **that family's own structural marker** —
`__NEXT_DATA__` for `EMBEDDED_NEXT_DATA`, a `window.__NUXT__` payload for
`EMBEDDED_NUXT_STATE`, schema.org Event microdata for `MICRODATA`, and for
`OTHER_EMBEDDED_APP_STATE` a substantive embedded JSON payload that is not
boilerplate. Each family verifies its own marker, so one family can never
launder another's error.

Rules:

- A claim the live page does not support is downgraded to
  `SOURCE_REVIEW_REQUIRED`, with the reason retained. **Honest "needs
  review" beats false Tier-2 confidence.**
- The audit only ever **removes** confidence. A confirmed source is left
  exactly as it was; nothing is ever promoted.
- `UNREACHABLE` is never treated as a failed claim — an unreachable page
  is not evidence of anything, so readiness is left untouched.
- Families that are already the conservative answer
  (`CLIENT_RENDERED_UNKNOWN`, `ACCESS_BLOCKED`) are not audited, because
  over-classifying *into* them costs nothing.

Verdicts are retained in `source-family-audit.json` and survive a
recompile, so a downgraded readiness never loses its reason.

## Artifacts

Under `research/major-event-venues/uk-major-event-census-01/`:

| File | Contents |
| --- | --- |
| `workstreams/*.json` | Raw per-venue-class research, as gathered |
| `venues.json` | The census venue records |
| `calendar-sources.json` | Every official calendar source, with family and readiness |
| `capacity-evidence.json` | Every capacity figure with its own cited source |
| `research-provenance.json` | Per-workstream method notes, accept/reject counts, and calendar-recovery outcomes |
| `census-summary.json` | Deterministic analytical summaries, coverage matrix, operator estates, priority table |
| `source-family-audit.json` | Per-source verdicts from the Phase 15 family audit |
| `data-quality-flags.txt` | Known defects IN the census, as retained evidence |
| `fingerprint-precision-sample.txt` | The original spot audit that exposed family over-classification |
| `reusable-platform-estates.txt` | Re-verification of the large shared-platform estates |

## Rebuilding

```bash
node ingestion/major-event-census/run-census.mjs compile         # pure, offline
node ingestion/major-event-census/run-census.mjs fingerprint     # bounded live GETs, one per calendar URL
node ingestion/major-event-census/run-census.mjs audit-families  # bounded live re-check of TIER2 family claims
node ingestion/major-event-census/run-census.mjs summarise       # deterministic summaries
```

`compile` and `summarise` are deterministic: the same inputs produce
byte-identical outputs. `fingerprint` and `audit-families` are the only
networked steps, they issue one GET per source, and neither acquires any
events.

`fingerprint` is incremental — a source already fingerprinted is not
re-fetched, so a later research pass that ADDS calendar sources only costs
requests for the genuinely new ones. Run `audit-families` AFTER
fingerprinting so newly added sources are audited too.

### Calendar patch files

`workstreams/*-calendars.json` and recovery files are **additive patches**,
not workstreams. A patch matches a venue on name+city and can only ADD a
calendar source it does not already have, or quarantine an official URL
via `identity_findings`. It can never invent a venue, change a capacity or
remove anything — so a later calendar pass can never damage completed
venue research.
