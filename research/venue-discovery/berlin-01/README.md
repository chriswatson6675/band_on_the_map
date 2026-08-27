# Berlin practical multisource discovery census

This is a `PRACTICAL_MULTISOURCE_DISCOVERY_CENSUS`, not a claim to list every Berlin venue. Discovery leads are not canonical Venue facts or event facts.

## Counts

- Raw OSM/Overpass candidates: 170
- Raw Berlin Open Data curated-directory candidates: 42
- Existing BeatMapped registry observations: 38
- Deterministically deduplicated candidates: 221
- Already acquired: 38
- Known source not active: 0
- Known venue without source: 0
- Newly discovered: 181
- Possible existing matches needing review: 2
- Possible duplicate groups: 9
- Obviously irrelevant/malformed records excluded: 73
- Identities needing human review: 9

## Sample new leads

- Grips Theater (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Theater Strahl (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Ballhaus Ost (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Theaterkapelle (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Tanzfabrik Berlin e.V. (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Dock 11 (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Laborgras (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- ada Studio & Bühne (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Canstanza Macras (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Nico and the Navigators (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Rimini Protokoll (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)
- Theater im Palais (BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS)

## Governance handoff

`DISCOVERED_CANDIDATE → OFFICIAL_SOURCE_RESOLUTION → SOURCE_INVESTIGATION → READY_FOR_ACTIVATION → COLLECTOR`. Promotion is explicit and must follow `docs/SOURCE_INVESTIGATION_POLICY.md`. No production registry is written by this command.
