# Berlin insufficient-evidence review

Second-pass review of all **100** records classified `INSUFFICIENT_EVIDENCE` in the original Berlin triage. These are proposed conclusions only. The original triage remains unchanged; no source or venue was activated.

## Result

The first-pass threshold was **MATERIALLY_OVER_CONSERVATIVE**. It was safe for production, but it coupled venue proof to acquisition-source proof. The second pass finds **16 proven**, **6 likely**, and **6 plausible** music venues among the 100.

Evidence-state distribution:

```json
{
  "ACCESS_OR_DISCOVERY_LIMITATION": 1,
  "CURRENT_MUSIC_VENUE_SOURCE_UNRESOLVED": 6,
  "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN": 20,
  "FIRST_PARTY_SITE_EXISTS_BUT_PROGRAMME_NOT_FOUND": 3,
  "IDENTITY_PROBLEM_DISCOVERED": 9,
  "LIKELY_CLOSED_OR_HISTORICAL": 6,
  "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK": 12,
  "LIKELY_IRRELEVANT_OR_NON_MATERIAL": 19,
  "NO_MEANINGFUL_CURRENT_EVIDENCE_FOUND": 17,
  "SOCIAL_FIRST_CURRENT_VENUE": 4,
  "THIRD_PARTY_EVIDENCE_ONLY": 3
}
```

Venue-likelihood distribution:

```json
{
  "CURRENT_PLACE_MUSIC_NOT_PROVEN": 20,
  "LIKELY_CLOSED_OR_HISTORICAL": 6,
  "LIKELY_CURRENT_MUSIC_VENUE": 6,
  "LIKELY_NOT_MATERIAL_MUSIC": 19,
  "PLAUSIBLE_MUSIC_VENUE": 6,
  "PROVEN_CURRENT_MUSIC_VENUE": 16,
  "UNKNOWN": 27
}
```

Acquisition-readiness distribution:

```json
{
  "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN": 8,
  "FIRST_PARTY_PROGRAMME_FOUND_NO_FUTURE_EVENTS_PROVEN": 10,
  "NO_PROGRAMME_FOUND": 58,
  "PROGRAMME_TECHNICALLY_UNREADABLE": 1,
  "SOCIAL_FIRST_PROGRAMME": 4,
  "SOURCE_IDENTITY_UNRESOLVED": 10,
  "THIRD_PARTY_PROGRAMME_ONLY": 9
}
```

## Potential venues hidden by insufficient evidence

| Venue | Likelihood | Programme/source state | Next step |
|---|---|---|---|
| Hebbel am Ufer (HAU 1, 2, 3) | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |
| RSO.Berlin | PROVEN_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| Kreuzwerk | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |
| Prince Charles | LIKELY_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| Bulbul Berlin | PROVEN_CURRENT_MUSIC_VENUE | SOCIAL_FIRST_PROGRAMME | Resolve and retain the authoritative programme path before any source proposal. |
| Reset | LIKELY_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| C115 | LIKELY_CURRENT_MUSIC_VENUE | SOURCE_IDENTITY_UNRESOLVED | Resolve and retain the authoritative programme path before any source proposal. |
| M-BIA | PROVEN_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| ACUD | PROVEN_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| American Western Saloon | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |
| Wild at Heart | PROVEN_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| Der Weiße Hase | PROVEN_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| Zur Klappe | LIKELY_CURRENT_MUSIC_VENUE | SOCIAL_FIRST_PROGRAMME | Resolve and retain the authoritative programme path before any source proposal. |
| Musikbrauerei | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |
| Kit Kat Club | PROVEN_CURRENT_MUSIC_VENUE | SOCIAL_FIRST_PROGRAMME | Resolve and retain the authoritative programme path before any source proposal. |
| Heideglühen | LIKELY_CURRENT_MUSIC_VENUE | SOCIAL_FIRST_PROGRAMME | Resolve and retain the authoritative programme path before any source proposal. |
| MS Hoppetosse | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |
| Panke | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |
| Maaya | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |
| OXI Garten | PROVEN_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| Duncker | LIKELY_CURRENT_MUSIC_VENUE | THIRD_PARTY_PROGRAMME_ONLY | Resolve and retain the authoritative programme path before any source proposal. |
| Golden Gate | PROVEN_CURRENT_MUSIC_VENUE | FIRST_PARTY_FUTURE_PROGRAMME_PROVEN | Inspect the programme surface against existing generic adapters in a separate governed source investigation. |

`OXI Garten` is proven as a current music programme area but is not counted as an independent universe addition because it is part of OXI.

## Plausible but still unproven

| Venue | Exact missing evidence |
|---|---|
| Auster-Club | Current recurrence, named-artist density, and a reliable programme source remain unproven. |
| Trompete | Current recurrence, named-artist density, and a reliable programme source remain unproven. |
| Stella Berlin | Current recurrence, named-artist density, and a reliable programme source remain unproven. |
| Vitrin | Current recurrence, named-artist density, and a reliable programme source remain unproven. |
| Tabula Rasa | Current recurrence, named-artist density, and a reliable programme source remain unproven. |
| spindler & klatt | Current recurrence, named-artist density, and a reliable programme source remain unproven. |

## Low-evidence and noise residue

**17** records still have no meaningful contemporary evidence. Recurring noise patterns are generic or ambiguous OSM nightclub names, stale OSM records, hospitality/private-hire businesses, and municipal performing-arts records whose music role is not material to BeatMapped. The machine artifact identifies the original discovery signal for every low-evidence record.

## Universe reassessment

- Original practical universe: **89**
- Additional proven independent venues: **15**
- Additional likely independent venues: **6**
- Revised conservative universe (proven only): **104**; existing acquisition coverage **36.5%**
- Revised broader universe (proven + likely): **110**; existing acquisition coverage **34.5%**
- Plausible candidates remain outside both denominators.

## Automation lessons

The largest gains come from multi-engine entity resolution, recognised event-platform resolution, social-first programme discovery, explicit separation of venue status from acquisition readiness, and closure/room detection. Deterministic code can continue on first-party static programmes; AI research is useful for aliases, social-first and third-party-only cases; human judgement is reserved for genuine canonical-identity questions.

## Evidence boundary

A single bounded public search request was retained for every candidate; 98 were restricted by the search provider. No CAPTCHA, authentication, bot protection, or access control was bypassed. Material recoveries cite the public pages reviewed on 27 August 2026. The review conclusions are AI interpretation; they are not source activation decisions.
