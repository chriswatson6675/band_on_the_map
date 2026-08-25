# hard-club-porto-02

This is a **new, superseding governed investigation** of Hard Club (Porto,
Portugal), run under `BOTM-SOURCE-INVESTIGATION-v1.2`. It **supersedes**
`research/source-investigations/hard-club-porto-01/` (`supersedes:
"hard-club-porto-01"` in `investigation.json`), which remains byte-identical
and untouched — this is a new record, not a rewrite of the old one, per
"History and supersession" in `docs/SOURCE_INVESTIGATION_POLICY.md`.

Nothing in this directory changes `sources/*.json`, any `venues/*.json`
registry, `venues/manual-coordinates.json`, public map data, or scheduler
configuration. `investigation.json` records a research conclusion, not an
activation.

## Why this investigation exists

`hard-club-porto-01` (v1.1) proved a genuine, non-browser, two-step
session-bootstrap → AJAX acquisition path, and reliable title, day+month,
floating local time, venue, event URL, a stable source-record identity (the
event's own canonical URL slug), and price/detail data. It stopped at
`HUMAN_REVIEW` because the calendar **year** was never directly stated in
any structural response, and v1.1 correctly refused to infer one from list
order or "today's date". Policy `v1.2` (`BOTM-GIG-FACT-DERIVATION-
GOVERNANCE-02`) introduced `DETERMINISTIC_CONTEXT`: a precise fact may be
`PROVEN` when it is mechanically, reproducibly combined from two or more
retained pieces of first-party context — not merely repeated verbatim, but
also not guessed. This investigation asks, honestly and from fresh
evidence: **does that new tool actually resolve Hard Club's year gap, or
does the year stay unresolved even under v1.2?**

## What this investigation did differently from v1.1

- Restarted the probe ladder at Level 1 against the **live** site, with
  **freshly acquired** evidence (2026-08-25), not a continuation or
  mechanical upgrade of the old record.
- At Level 2 (`STRUCTURAL`), informed by — but independently
  re-confirming — the historical finding, this investigation tested the
  two-step session-bootstrap flow **directly**, without opening a browser
  at all. It worked. Escalation terminates at Level 2 here; **no browser
  was used anywhere in this investigation** (`hard-club-porto-01` needed a
  Level 3 Playwright session to *discover* the mechanism; this investigation
  only needed to *test* it, because the mechanism itself was already
  documented history — and it is honestly re-proven with new evidence, not
  copied).
- Sampled all 22 currently-listed events (11 Sep 2026 → 12 Feb 2027),
  crossing the 2026/2027 calendar-year boundary naturally.
- Specifically investigated the event's own canonical URL-path slug as a
  candidate year signal — the SAME slug already proven (in both v1.1 and
  here) to be the source's own stable `source_record_id`.
- Cross-checked that candidate rule against three independent corroboration
  sources before trusting it: (1) first-party event title/description text,
  (2) Hard Club's own retained past-events archive (five further real year
  boundaries), and (3) an operator-directed addendum investigating Hard
  Club's own linked third-party ticketing pages (see below).
- Authored a dependency-free, no-network offline proof
  (`evidence/offline-proof.mjs`) that recomputes every claim from retained
  fixtures and fails loudly on a genuine anomalous record rather than
  guessing.

## The year finding

**Candidate signal:** the event's own canonical URL-path slug's trailing
`-YYYY` segment (e.g. `johnny-hooker-euro-tour-2026-2026` → `2026`).

**Why it is not the same mistake v1.1 correctly avoided.** v1.1 explicitly
declined to infer a year from list order/sequence ("the list appears
chronological, so...") — that is exactly the `AI_INFERENCE` trap this
policy prohibits. This investigation does not do that either. The slug's
year is not derived from the event's *position* in the list at all; it is
read directly off a field the source **itself** already treats as canonical
identity (see `field_assessment.source_record_id` — this is the identical
slug, already proven stable). The list only supplies the day+month; the
year comes from a wholly separate, source-owned attribute.

**How it was validated, not merely proposed.** For every candidate
mechanism, `docs/SOURCE_INVESTIGATION_POLICY.md`'s seven year-investigation
questions were applied:

1. *First-party?* Yes — the slug is generated and used by hardclubporto.com
   itself.
2. *Stable/source-owned?* Yes — already proven for `source_record_id`
   (v1.1 and this investigation).
3. *Applies to every event?* Yes — all 22 sampled events' slugs carry a
   trailing 4-digit year with no exception.
4. *Deterministic mapping?* Yes — one regex extraction, one result.
5. *Could two years satisfy the same inputs?* No — a slug has exactly one
   trailing year segment.
6. *Reproducible offline without AI judgement?* Yes —
   `evidence/offline-proof.mjs` does exactly this, mechanically.
7. *Does the source contradict the mapping anywhere in the sample?* No —
   checked against three independent corroboration sources, zero
   contradictions:
   - **6 events' own title/subtitle or loadevent free-text description**
     state a year (or, for Lebanon Hanover, a **full explicit date**,
     `"21 de Novembro de 2026"`) directly — all 6 match the slug-derived
     year exactly, including both sides of the boundary (Fresno's own
     `<h3>` title literally reads `"FRESNO EUROTOUR 2027"` for its `12 Fev`
     show; U.D.O.'s own description says the tour `"regressam a estrada no
     inicio de 2027"` for its `29 Jan` show).
   - **Hard Club's own past-events archive** (bounded excerpt,
     `evidence/arquivo-boundary-excerpt.html`) contains 7 real "Happy Neo
     Year" New Year's Eve events, each dated `31 Dez`, spanning 5 further
     real year boundaries (2017/18, 2018/19, 2021/22, 2022/23, 2023/24).
     Every one resolves to 31 December of its OWN slug year — including
     `HAPPY NEO YEAR! 2018/2019`, whose own title names **both** years
     while its slug/date correctly resolve to `2018-12-31`, not
     `2019-12-31`. This proves the slug tracks the actual occurrence date,
     not tour/season branding.
   - **The linked-ticketing addendum** (below): 15 of 22 events'
     Hard-Club-linked, event-specific third-party ticket pages state an
     exact machine-readable date; all 15 match the slug-derived date with
     zero contradictions.
   - The archive also surfaced a genuine **negative control**: one record
     (slug literally `"2020"`, blank title) carries no hyphen-prefixed year
     segment at all. The derivation rule correctly refuses to resolve it
     rather than emitting a guess — proven in
     `evidence/offline-proof-output.txt` Step 6.

**Result:** `field_assessment.start_date` is `PROVEN`, `basis:
"DETERMINISTIC_CONTEXT"`, for every one of the 22 sampled events (20 in
2026, 2 in 2027), with a `derivation` object citing the exact rule and
inputs, and `evidence_refs` including the `DETERMINISTIC_DERIVATION` offline
proof required for activation.

## LINKED TICKETING ANALYSIS (addendum)

An operator addendum, received mid-investigation, asked this investigation
to independently prove a specific manual observation: that Hard Club's
IRA! event links to `https://www.clubedoingresso.com/evento/ira-porto`,
which visibly states a full date. This was treated strictly as a
**discovery lead**, not evidence in itself, and independently proven from
scratch.

**IRA! — the worked example.**

- Hard Club's own record: slug `ira-2026`, list date `03 Out`, room/time
  `Sala 1 : 20H00` (per `evidence/ajax-agenda-warm.html`).
- Hard Club's own `loadevent` AJAX fragment for this exact event
  (`evidence/ajax-loadevent-ira-2026.html`) contains
  `<div class="bilhetes"><a href="https://www.clubedoingresso.com/evento/ira-porto" target="_blank">` —
  **Hard Club itself directly links this exact event to this exact ticket
  URL.** This is not a search result or an unrelated third-party mention;
  it is emitted by Hard Club's own structured event data.
- The linked page (`evidence/clubedoingresso-ira.html`, fetched live) states
  the title `"IRA! Pela Primeira Vez em Porto, Portugal!"`, the venue
  `"Hard Club Porto"` / `"Praça do Infante D. Henrique"`, a schema.org
  `Product`/`Offer` block priced `35.00 EUR` (matching Hard Club's own
  loadevent price `35€` exactly), and — critically —
  `<div class="PageEvent__desc">Sábado, 03 de Outubro de 2026 - Abertura: 20:00 - Início: 21:00</div>`:
  the **full explicit date**, matching Hard Club's day/month and slug year
  exactly.
- One genuine discrepancy was found and is retained honestly: Hard Club's
  OWN free-text description for this event says the tour arrives `"em
  marco de 2026"` (**March** 2026), while the day/month, slug year, and the
  linked ticket page's own description (`"em outubro de 2026"`, October)
  all agree on **October**. This is a real inconsistency in Hard Club's own
  marketing copy for this one event — logged as a MINOR blocker in
  `collector_assessment.blockers` — and is exactly why this investigation
  does not treat free-text descriptions as authoritative on their own.

**The broader 22-event survey.** Every one of the 22 sampled events carries
a Hard-Club-linked, event-specific external ticket URL (10 distinct
providers: ticketline.pt ×7, bol.pt ×4, shotgun.live ×2, ticketshop.eu ×2,
clubedoingresso.com ×2, and one each of enterticket.es, weeztix.com,
q2ingressos.com.br, camarotetickets.com, westlive.mticket.eu). A scripted,
mechanical (regex, no AI judgement) survey of these pages
(`evidence/linked-ticketing-survey.json`) found:

| Metric | Count |
|---|---|
| Total events sampled | 22 |
| Events with a Hard-Club-linked ticket URL | 22 / 22 |
| Linked pages supplying an exact machine-readable date | 16 / 22 (15 from the scripted survey + IRA! itself) |
| Exact deterministic matches against the slug/list-derived date | 16 / 16 (zero contradictions) |
| Events whose linked page is a client-rendered JS shell with no static date (5 providers: shotgun.live ×2, weeztix.com, q2ingressos.com.br, camarotetickets.com, plus U.D.O.'s westlive.mticket.eu) | 6 / 22 |

**Governance analysis (does current v1.2 let this stand alone as `PROVEN`
basis?) — NO, and this package does not pretend otherwise.**
`docs/SOURCE_INVESTIGATION_POLICY.md`'s `DETERMINISTIC_CONTEXT` definition
requires combining "two or more retained pieces of **first-party**
context." A third-party ticketing page — even one Hard Club itself directly
and specifically links, for this exact event, from its own structured data
— is still third-party content once you are reading *its* page. The
"Third-party sources" section is explicit: third-party pages "must not
automatically become authority for that candidate's first-party facts...
unless a later, explicit policy says otherwise." No such later policy
exists yet. So:

- **Case A (unrelated third-party discovery/search result)** — clearly
  weak, never usable as `PROVEN` basis. Not what IRA!/clubedoingresso.com
  is.
- **Case B (venue-designated, event-specific ticketing page linked directly
  from Hard Club)** — genuinely stronger than Case A, evidenced end-to-end
  in this package (link chain retained, identity/venue/date match proven,
  zero contradictions across 16 cross-checked events) — **but still not a
  basis v1.2's vocabulary can mark `PROVEN` on its own**, because it is not
  first-party.

This investigation therefore used the linked-ticketing findings **only as
additional, retained, cited corroborating evidence** (in
`field_assessment.start_date.evidence_refs` and
`collector_assessment`/`data_paths`), never as the derivation's `basis` or
one of its `derivation.inputs` — the actual `DETERMINISTIC_CONTEXT` basis
for `start_date` rests entirely on Hard Club's own first-party slug + list
data, which independently already clears every activation gate without
needing the ticketing evidence at all.

**Smallest governance change that would let Case B count directly.** A
future, deliberate policy addition — e.g. a new evidence/basis concept such
as `LINKED_TICKETING_SOURCE` (or a `DETERMINISTIC_CONTEXT` carve-out
specifically for a source-emitted, event-specific, single-target external
link whose target independently corroborates without contradiction) — could
let a first-party *link* to a third-party page count as one governed input,
provided the link is genuinely source-structured (not a generic homepage
link) and the target is genuinely event-specific and non-ambiguous. This
package does **not** implement or authorise that change; it only documents
that the evidence for it, if wanted, is real and already retained here.

## Cross-check against the historical record (v1.1 vs v1.2)

| | `hard-club-porto-01` (v1.1) | `hard-club-porto-02` (v1.2) |
|---|---|---|
| Policy version | `BOTM-SOURCE-INVESTIGATION-v1.1` | `BOTM-SOURCE-INVESTIGATION-v1.2` |
| Probe evidence | Fresh, live (2026-08-25 ~00:30-01:45Z) | Fresh, live (2026-08-25 ~08:26-09:45Z) — independently re-acquired, not reused |
| Highest probe level reached | 3 (`BROWSER_OBSERVATION`) | 2 (`STRUCTURAL`) — browser never used |
| Acquisition mechanism | Two-step session-bootstrap → AJAX, discovered via browser, then reproduced via curl | Same mechanism, independently re-confirmed directly via curl at Level 2, without ever needing a browser |
| Sample size | 22 events (same natural sample — same live agenda) | 22 events |
| Title / venue / event URL / source_record_id / price | `PROVEN` | `PROVEN` (re-confirmed, unchanged in substance) |
| `start_date` | `PARTIAL` — day+month proven, year unresolved | `PROVEN`, `basis: DETERMINISTIC_CONTEXT` — full date resolved for all 22 events |
| Decision | `HUMAN_REVIEW` | `READY_FOR_ACTIVATION` |

**What stayed the same:** the underlying site, acquisition mechanism, data
shapes, title/venue/price/source_record_id findings, and the honest
`PARTIAL` floating-local-time assessment are all unchanged in substance —
this is the same real venue and the same real data path, re-confirmed with
fresh evidence, not a different candidate.

**What is genuinely new (not just a policy label change):** (1) the
Level 2 discovery that the two-step session flow can be tested and
confirmed *without* a browser at all in a fresh investigation; (2) the
year-derivation rule itself and its supporting evidence — the slug-year
signal, the 6-event title/description cross-check, the 5-boundary archive
corroboration, and the entire linked-ticketing addendum — none of which
existed in, or was copied from, `hard-club-porto-01`; (3) the offline proof
script and its 14 passing checks.

**Why the decision differs:** not because the policy alone changed (a
policy version bump with no new evidence would not justify a different
decision — this package explicitly does not do that), but because this
investigation acquired and validated NEW first-party evidence that
mechanically resolves the one gap that kept the prior investigation at
`HUMAN_REVIEW`. The policy change (`v1.2`'s `DETERMINISTIC_CONTEXT`) is
what made looking for this kind of evidence legitimate to pursue and
record as `PROVEN` in the first place — but the year finding itself rests
on genuinely new, retained, cross-validated evidence, not on the policy
text alone.

## Decision

`decision.status: "READY_FOR_ACTIVATION"` — a **research conclusion only**.
See `investigation.json`'s `decision.reasons` for the full, evidenced
rationale and exact gate-by-gate justification. This package does **not**
modify `sources/*.json`, any `venues/*.json` registry, manual coordinates,
public map data, or scheduler configuration, and does not build or enable
any collector.
