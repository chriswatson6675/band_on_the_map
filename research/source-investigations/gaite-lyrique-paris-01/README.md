# gaite-lyrique-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates La Gaîté
Lyrique, a multidisciplinary digital-culture/music venue at 3 bis rue
Papin, 75003 Paris. Official site: https://www.gaite-lyrique.net/

## Operating status (verified, not assumed)

The task brief noted a prior pass suspected a possible partial 2025
closure and January 2026 reopening, and asked for this to be verified
honestly rather than assumed either way. The retained agenda page states
only a routine **seasonal** closure notice: "Fermeture : Du lun. 03.08 au
lun. 31.08" (closed 3–31 August) — which happens to cover part of today's
date (2026-08-26) but reads as an ordinary annual August closure, not a
structural one. No mention of any 2025 closure, renovation, or January
2026 reopening was found anywhere in either retained page. This is
reported honestly as an absence of evidence for the longer closure, not
proof it never happened — only what these two pages actually state.

## What was found

Level 1 (`PASSIVE_STATIC`) was fully sufficient. The official `/agenda/`
page is static, server-rendered HTML with **schema.org microdata**
embedded directly on each of 29 event cards — `itemprop=name`/`url` on the
title link, `<meta itemprop=startDate>`/`<meta itemprop=endDate>`, and (for
some cards) an `itemprop=location` `Place` naming a specific room. This is
a different pattern from JSON-LD (no `<script type="application/ld+json">`
anywhere), Nuxt (`__NUXT__`), or WordPress (`wp-json`) — none were present.

The same agenda page links to a dedicated **"Musique" category filter**
(`/agenda/concerts/`), which exposes exactly the music-relevant subset (15
cards) in the identical structured shape — a clean, source-provided way to
narrow to concerts without any music-relevance keyword guessing of our
own.

`end` is honestly `PARTIAL`: most cards' `endDate` repeats only the same
calendar day as `startDate` (no time-of-day) — the same "date span, not a
performance end-time" pattern already documented for Tempodrom Berlin's
JSON-LD `endDate` — but one sampled card ("Kiss Facility") does carry a
genuine same-day end time, so the field is not uniformly absent either.
`price` is honestly `NOT_PRESENT` on this data path.

## Decision

`READY_FOR_OFFLINE_PROOF`. No existing collector family in this repository
parses schema.org **microdata** (as opposed to JSON-LD) directly, so
`collector_assessment.recommended_family` is `NEW_FAMILY_REQUIRED` — a
small, new, source-agnostic parser
(`ingestion/gaite-lyrique-paris/discovery.mjs`) was written and proven
offline against the retained fixture (`tests/gaite-lyrique-paris.test.mjs`).
`READY_FOR_ACTIVATION` was deliberately not claimed; turning this into an
enabled source is a separate, later, explicitly-authorised step outside
this investigation's scope.
