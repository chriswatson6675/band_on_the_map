# cabaret-sauvage-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
Cabaret Sauvage (concert/club/festival venue, 59 Boulevard Macdonald,
75019 Paris — Parc de la Villette). Official site:
https://www.cabaretsauvage.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient to complete the investigation,
though not sufficient to establish a trustworthy date. The `/agenda` page
is a Webflow CMS Collection List rendered as plain static HTML, with
roughly 120 real, current dated event cards.

**The material finding**: the one sampled event detail page (Tony Vega)
contains a genuine, first-party **contradiction**, not just a missing-context
gap. A hero badge ("MER 04.11.26") matches the listing card's own badge
and the page's own body text ("mercredi 4 novembre") — three consistent
signals, cross-checked mechanically against the real Gregorian calendar
(4 November 2026 genuinely is a Wednesday). A separate "Date :" field on
the *same page* states "11/5/2026" in an unstated format; neither reading
of it (5 November → Thursday, 11 May → Monday) matches the Wednesday the
other three signals agree on. This is a direct conflict between two
first-party fields, not a gap this policy's `DETERMINISTIC_CONTEXT`
mechanism could resolve — resolving it in the majority's favour would
require a plausibility judgement (`AI_INFERENCE`), which can never be the
basis of a `PROVEN` field. `start_date` is therefore recorded honestly as
`AMBIGUOUS`.

Other fields (`title`, `source_record_id`, `event_url`, `price`) are
independently `PROVEN`/`DIRECT_SOURCE` and unaffected by this. Ticketing
is delegated to an informal Linktree link, and the sampled record's own
"Points de vente" field names a ticket-reseller domain ("Ticketmas.com")
that does not match any recognised canonical ticketing brand — a further,
honestly-noted data-quality signal, consistent with the weaker-source risk
flagged at task assignment.

## Decision

`HUMAN_REVIEW` — not `DEFER` or `REJECT`, because the acquisition path and
most fields are genuinely solid; not `READY_FOR_OFFLINE_PROOF`/`READY_FOR_ACTIVATION`,
because a real per-record date-integrity problem was found on the very
first detail page sampled and needs an explicit human decision (how
common is this, and how should a collector handle it) before any
collector is built. No ingestion code was written for this investigation,
per this project's own instruction to only build collectors for
`READY_FOR_OFFLINE_PROOF`/`READY_FOR_ACTIVATION` outcomes.
