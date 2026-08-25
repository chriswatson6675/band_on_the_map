# Source investigation: Museu do Fado (Lisboa)

**Non-authoritative.** `investigation.json` in this directory is the
authoritative structured record — this file only explains it to a human
reader, per `docs/SOURCE_INVESTIGATION_POLICY.md`.

## What this is

A bounded, governed source investigation of Museu do Fado's own public
"Eventos" listing (`https://museudofado.pt/eventos`), following
`docs/SOURCE_INVESTIGATION_POLICY.md` (policy version
`BOTM-SOURCE-INVESTIGATION-v1.1`). It answers one question: can Band on the
Map acquire this venue's event data automatically, honestly, and safely —
and if so, how? It does **not** add a collector, does not edit
`sources/*.json` or any `venues/*.json` registry, and does not change what
the public map shows.

## What was found

- **Identity**: `museudofado.pt` was independently re-confirmed as the
  museum's genuine official site (footer contacts/address, EGEAC link,
  `og:site_name`, a bol.pt ticketing listing under the museum's own name).
  The candidate events page given in the task brief
  (`https://museudofado.pt/eventos`) was verified correct and needed no
  correction.
- **Acquisition path**: `STATIC_HTML`. The events list page and every
  sampled event detail page are fully server-rendered — no JSON-LD, no ICS
  feed, and no WordPress/known-calendar-plugin fingerprint was found
  anywhere in the retained evidence. A small Vue.js layer only powers the
  search/filter form UI, not the event data itself.
- **Sample**: the events list page (7 cards: 6 ordinary + 1 highlighted),
  plus 4 individual event detail pages that are genuinely current/future
  relative to the retained HTTP `Date` response header (not stale archive
  data): *Marco Rodrigues canta Carlos do Carmo* (7 Nov 2026, CCB Grande
  Auditório), *SUL* (30 Oct 2026, CCB Pequeno Auditório), *Pop-Up Fado*
  (3 Sep 2026, Museu do Fado), and *O Fado Sou Eu!* (26 Aug 2026, Museu do
  Fado — the highlighted/featured event).
- **Fields**: title, start date, time, end date/time, venue/location name,
  and price/admission text are all reliably extractable (`PROVEN`) from a
  consistent structured field block on every detail page (Data / Horas /
  Até / Termina / Local / Preços). `event_url` is `PROVEN` via `og:url`
  matching the URL actually followed.
- **Stable ID**: **not** `PROVEN`. No numeric internal event ID is exposed
  anywhere in the retained HTML. The event's own URL slug is the best
  candidate (used consistently as both the list-card `href` and the detail
  page's `og:url`), but this was only observed once — its stability over
  *time* has not yet been empirically proven, so `source_record_id` is
  recorded as `PARTIAL` with the slug-based alternative strategy documented
  in its notes, per the policy's stable-identifier rule.
- **Platform quirks worth knowing**: the public listing is one
  undifferentiated archive spanning 2009–2026 (154 pagination pages), mixing
  already-occurred events (explicitly labelled `"Arquivo"` by the source
  itself) with current/future ones on the same page, in a non-strictly-
  chronological order. A collector must filter on that label and/or the
  event's own date, not assume the listing is pre-filtered or sorted. No
  timezone/UTC offset is stated anywhere (floating local dates/times). A
  minor source-side bug was also observed and retained (a malformed
  `og:image` value concatenating the domain twice) — recorded as evidence
  the source can carry small data-quality bugs, not treated as a broader
  parsing risk.
- **On the prior loose note**: this investigation did **not** treat "dated
  auditorium programme confirmed through Nov 2026" as evidence — it was
  independently re-derived from this investigation's own retained sample,
  which genuinely includes a real, non-archived Centro Cultural de Belém
  "Grande Auditório" concert dated 7 November 2026. This investigation makes
  no claim that this is necessarily the *last* such date; later pagination
  pages were observed to exist but were not fetched, to keep the retained
  sample bounded.

## Escalation

Only Level 1 (`PASSIVE_STATIC`) was needed and it was recorded
`SUFFICIENT` — plain `curl` GETs against the home page, the events list
page, and 4 detail pages already exposed everything needed for identity,
platform classification, data-path discovery, and field assessment. No
Level 2/3/4 escalation was attempted or is justified by this evidence.

## Decision

`READY_FOR_ACTIVATION` — every activation gate in
`docs/SOURCE_INVESTIGATION_POLICY.md`'s "Activation gates" section is met:
identity `PROVEN`, a resolved/supported `STATIC_HTML` acquisition class, a
confirmed public data path, `title`/`start_date` assessed, an explicit
alternative identity strategy documented for `source_record_id`, a known
collector family (`STATIC_EVENT_LIST`), retained evidence including a
`DETERMINISTIC_DERIVATION` offline proof, and only `MINOR` (never
`CRITICAL`) blockers. Per policy, this is a **research conclusion only** —
it changes nothing in `sources/*.json` or any registry; turning it into an
active collector is a separate, explicitly-authorised step.

## Files

```text
investigation.json                                   <- authoritative record
README.md                                             <- this file
evidence/
    body-home.html / headers-home.txt                 <- home page
    body-eventos.html / headers-eventos.txt            <- events list page
    body-detail-marco-rodrigues-canta-carlos-do-carmo.html / headers-*.txt
    body-detail-sul.html / headers-*.txt
    body-detail-pop-up-fado-4.html / headers-*.txt
    body-detail-o-fado-sou-eu.html / headers-*.txt
    offline-proof.mjs                                  <- deterministic re-parse/cross-check
    offline-proof-output.txt                           <- its captured stdout (exit 0)
```

All evidence was acquired via plain `curl` with a real, descriptive
User-Agent (`BandOnTheMap-SourceInvestigation/0.1`) — never `WebFetch`, so
that retained bodies are genuinely `byte_faithful: true` `DIRECT_EVIDENCE`,
not an AI-summarized reinterpretation of the page.
