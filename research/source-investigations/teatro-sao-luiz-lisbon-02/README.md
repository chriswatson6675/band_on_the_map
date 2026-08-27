# teatro-sao-luiz-lisbon-02

**Supersedes `teatro-sao-luiz-lisbon-01`.** This is a targeted, explicitly
authorised re-investigation of the ONE open question `-01` deliberately
left to a human/operator decision: could a policy-compliant (`v1.2`)
`DETERMINISTIC_CONTEXT` derivation close the season's calendar-year gap for
the FULL season, not just the 6 months `-01` happened to sample? The answer
this investigation reaches is **yes**, and `decision.status` here is
**`READY_FOR_ACTIVATION`**. `-01`'s own record remains durable and unedited
on disk, per "History and supersession" in
`docs/SOURCE_INVESTIGATION_POLICY.md` — this is a new investigation, not a
rewrite of the old one.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## What changed since `-01`

`-01` found that the site's own static acquisition path (the 26-event
programme list plus every sampled detail page) never states a calendar
year, anywhere, for any event — mechanically confirmed, not assumed — and
that the season genuinely spans a calendar-year boundary (`2026-2027`).
`-01` also discovered an auxiliary JSON endpoint
(`/wp-json/custom/v1/espetaculos?season=...&month=...`) that carries real,
year-inclusive dates for a sparse subset of titles, and used it to
recover the year for exactly one sampled event (André Rosinha Trio →
2027-01-14) — but stopped short of generalising that into a rule for the
whole season, because only 6 of the season's 12 months had been sampled and
the endpoint's own title coverage was proven unreliable as a complete
events feed.

This investigation does two new things `-01` did not:

1. **Escalated to Level 2 (`STRUCTURAL`)** and inspected the site's own
   public theme JavaScript bundle
   (`wp-content/themes/tsl/js/main.js`) — something `-01` never looked at,
   having stayed at Level 1 the whole way through. That bundle contains a
   literal, unconditional, non-time-dependent rule inside the
   season-selector's own `change` handler:

   ```js
   if (currentMonth >= 8 && currentMonth <= 12) {
     selectedMonth = `${selectedSeason.split("-")[0]}-${currentMonth}`;
   } else {
     selectedMonth = `${selectedSeason.split("-")[1]}-${currentMonth}`;
   }
   ```

   In plain terms: **month 8–12 maps to the season label's own start-year
   component; month 1–7 maps to its own end-year component.** This is
   evaluated purely against literal integers baked into the site's own
   retained source code — it never calls `new Date()` in this branch, so it
   is not a today's-date lookup dressed up as a rule.

2. **Re-queried the auxiliary calendar API for literal every month (01
   through 12) of the season**, not just the 6 `-01` sampled. 9 of the 12
   months returned real, year-inclusive dated entries (46 entries total;
   the other 3 — February, March, August — returned an empty result, never
   an error or a conflicting year). Every single one of those 46 entries
   matched the theme-JS rule's own predicted year for its month, with
   **zero contradictions** (`evidence/offline-proof.mjs` Steps 5a/5b).

A third, independent, corroborating (not load-bearing) signal was also
found: the box office ("Bilheteira") page states its own opening hours run
**"a partir de 1 de setembro"** (from 1 September) and that it closes
**"entre 1 a 31 de agosto"** (1–31 August) — first-party confirmation that
the venue's own operating year turns over at the Aug/Sep boundary, entirely
independent of the theme-JS finding above.

No retained static page anywhere states the season's month boundaries as a
plain marketing sentence (e.g. "runs from September to July") —
`evidence/offline-proof.mjs` Step 2 checks every retained static page for
exactly that and finds none. The rule this investigation relies on lives in
the site's own client-side source code, not in prose.

## Escalation ladder

**Level 1 (`PASSIVE_STATIC`) was `INSUFFICIENT`** for this investigation's
specific question (though it re-confirmed identity and platform
classification, matching `-01`'s own findings). Every retained static page
(programme EN/PT, home EN/PT, seasons archive EN/PT, bilheteira) was
searched for an explicit season-boundary sentence; none was found. A
GET-parameter probe of the season-archive filter
(`?opt_filter=2025-2026`) was also tried, on the chance an already-completed
season's own event list might show real historical dates — it returned the
same static "no results" shell as an unfiltered request, proving that
filter is AJAX-driven (via `admin-ajax.php`), not server-rendered, so it
was rejected as a direct data path.

**Level 2 (`STRUCTURAL`) was `SUFFICIENT`.** Inspecting the theme's own
public `main.js`/`plugins.js` bundles (public JS/bootstrap data, per Level
2's own definition) found the literal rule described above. Re-querying the
already-discovered auxiliary API for every month of the season (per Level
2's "inspect publicly-referenced endpoints" guidance) empirically confirmed
it with zero contradictions. No Level 3 (`BROWSER_OBSERVATION`) session was
ever opened — nothing here required JS execution or a browser.

## The derivation, in full

`field_assessment.start_date` is now `PROVEN`, `basis: "DETERMINISTIC_CONTEXT"`:

- **Input 1**: the site's own season label, `"2026-2027"` (from its own
  `data-temporada-actual` / `data-season` attributes).
- **Input 2**: the site's own theme JavaScript rule (month 8–12 → season
  start-year component; month 1–7 → season end-year component).
- **Input 3**: each event's own day+month text from the retained static
  programme list (e.g. `"9 September"` for Batucadeiras das Olaias).

Combining these three deterministically and reproducibly (never by
plausibility, prediction, or today's date) yields exactly one full date per
event. Applying the rule to all 26 events on the freshly re-fetched static
list resolves every one of them: **23 events → 2026** (September, October,
November, December), **3 events → 2027** (January ×2, April) — with zero
ambiguity and zero event falling outside the season.
`evidence/offline-proof.mjs` reproduces this mechanically, offline, with no
network access, and prints the full 26-event derived-date table.

This matches `docs/SOURCE_INVESTIGATION_POLICY.md`'s own worked-examples
table entry for exactly this pattern: *"Programme states season + month,
WITH the source's own explicit, retained season-boundary rule … only if the
season→year mapping is itself explicit and mechanical, not assumed."* Both
conditions are met here: the rule is explicit (found verbatim in
unobfuscated, first-party source code, not inferred from site behaviour),
and it was tested exhaustively — every month the season's own API could be
queried for — with zero contradictions.

## What was honestly NOT claimed

- **August (month 8) is empirically untested.** The auxiliary API returned
  no events for month=08, and the box office is closed the whole month, so
  there is genuinely no data either confirming or contradicting the rule
  for that specific month. This is recorded as a `MINOR` blocker, not
  silently assumed correct.
- **The rule's durability over time is not guaranteed.** It lives only in
  one version of the theme's public JS (`ver=7.1` at time of investigation).
  If the theme changes, the rule could change with it — recorded as a
  `MINOR` blocker recommending periodic re-verification.
- **The auxiliary calendar API remains an unreliable events feed** — this
  finding from `-01` is unchanged and independently re-confirmed here (its
  January response still includes a title, "NA MINHA BOCA", absent from the
  static English programme entirely). This investigation used it solely to
  falsification-test the year-mapping rule, never as a source of event
  titles, venues, or prices.
- **`time` and `end` remain `PARTIAL`**, unchanged from `-01` — this
  investigation's scope was the calendar-year gap specifically, not the
  time-of-day/timezone or explicit-end-time gaps, which are real but
  separate limitations.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses every retained fixture in this directory and
mechanically reproduces every claim above in 8 steps: the season label, the
absence of explicit prose, the bilheteira corroboration, the theme-JS
rule's own literal boundary integers, the 12-month empirical cross-check
(zero contradictions), the full 26-event derived-date table, a best-effort
API cross-check, and source_record_id stability (both within this
investigation and against `-01`'s own recorded id, two days apart). Run
with `node offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt`. It exits `0` with every check passing.

`evidence/validate-mine.mjs` additionally confirms `investigation.json`
itself passes `validateInvestigation()` from
`ingestion/source-investigation/contract.mjs` with zero errors.

## Decision

`decision.status` is **`READY_FOR_ACTIVATION`**. Every gate in
`docs/SOURCE_INVESTIGATION_POLICY.md` (v1.2) is satisfied against retained,
freshly-acquired, cited evidence, including the v1.2-specific requirement
that a `DETERMINISTIC_CONTEXT`-basis gated field (`start_date`) cite an
offline `DETERMINISTIC_DERIVATION` proof. As always: **this is a research
conclusion only.** It does not edit `sources/*.json`, any `venues/*.json`
registry, or public map data. Turning this into an active collector is a
separate, explicitly-authorised step — see "Investigation and activation
are separate" in `docs/SOURCE_INVESTIGATION_POLICY.md`.
