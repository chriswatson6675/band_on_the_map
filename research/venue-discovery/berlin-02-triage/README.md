# Berlin 181-candidate triage

This is a bounded acquisition-backlog census, not activation. All **181** new discovery candidates have exactly one status. No source, venue, collector, mapping, or publication artifact is changed.

## Counts

- Current regular music venues: 43
- Current occasional but material music venues: 8
- Closed/historical: 3
- Duplicate/room: 6
- Music not material/non-music: 7
- Identity uncertain/insufficient: 114
- First-party sites resolved HIGH/MEDIUM: 74
- Future programmes proven: 23

## Coverage

The practical evidence-backed universe is **89** venues: 38 already acquired plus 51 current regular/material candidates. Acquisition coverage is **42.7%**. Coordinates are not part of this calculation.

## Route to 50

Wave 1 is the five configuration-level quick wins (38 → 43). Wave 2 is the eight-candidate declarative static list/detail cohort (43 → 51). This is a planning projection only; every activation remains a separate authorized package.

## Volume criteria

Programme volume uses the maximum of distinct retained event-like links and explicit full future-date tokens: VERY_HIGH ≥40, HIGH ≥15, MEDIUM ≥5, LOW ≥1, otherwise UNKNOWN. It is a visible-signal band, never a fabricated event count.

## Evidence boundary

The triage used the retained Berlin discovery census, earlier governed investigations, and bounded passive Level 1 probes for candidates with a reported or manually resolved first-party site. Each probe used at most the homepage plus one directly linked, same-origin programme-like page. No login, bypass, browser escalation, or hidden-endpoint guessing was used. `triage.json` is authoritative and cites candidate-level evidence. Low-confidence identities remain unresolved rather than inferred.

## Ranked quick wins

1. **Hole⁴⁴** — JSON_LD_EVENT, CONFIGURATION_ONLY, VERY_HIGH visible-signal volume.
2. **Loci Loft** — JSON_LD_EVENT, CONFIGURATION_ONLY, HIGH visible-signal volume.
3. **Terzo Mondo** — WORDPRESS_TRIBE_API, CONFIGURATION_ONLY, HIGH visible-signal volume.
4. **Komische Oper Berlin** — PER_EVENT_ICS, CONFIGURATION_ONLY, VERY_HIGH visible-signal volume.
5. **BRICKS Club** — SQUARESPACE_CALENDAR, CONFIGURATION_ONLY, MEDIUM visible-signal volume.

These are acquisition opportunities only. Each still requires a separately authorised governed investigation, offline proof, registry change, and activation.

## Ranked capability multipliers

1. **GENERIC_DECLARATIVE_STATIC_EVENT_LIST** — 8 candidates, MEDIUM: Deutsche Oper Berlin, Staatsoper Unter den Linden, Neuköllner Oper, Pierre Boulez Saal, Philharmonie, Gretchen, Metropol, Velodrom.
2. **GENERIC_WORDPRESS_EVENT_DISCOVERY** — 7 candidates, MEDIUM: Slaughterhouse, Hafenbar, Ohm, Beate Uwe, Kammermusiksaal Friedenau, ÆDEN, Club der Visionaere.
3. **GENERIC_SQUARESPACE_EVENT_CALENDAR** — 5 candidates, LOW_TO_MEDIUM: BRICKS Club, Prachtwerk, Trompete, Havanna, MONOM.
4. **GENERIC_WIX_OR_EMBEDDED_APP_STATE** — 2 candidates, HIGH: RSO.Berlin, spindler & klatt.

## Human-assistance queue

- **The Hub:** No official identity or website was resolved. Founder: Find a current sign, official profile, or exact address for the reported club. Codex afterward: Verify the first-party domain and run a bounded passive probe.
- **West Germany:** A prior investigation could not establish a current programme. Founder: Confirm whether the Skalitzer Straße venue is still operating and identify its current official programme link. Codex afterward: Create a superseding governed investigation if new first-party evidence is supplied.
- **Jugendschiff ReMiLi:** The supplied domain now contains unrelated sailing content. Founder: Confirm whether the Berlin youth ship still exists under another official name/domain. Codex afterward: Resolve or reject the stale OSM identity with retained first-party evidence.
- **Parkdeck by Clärchen's:** The supplied URL points to Potsdam, conflicting with the Berlin candidate. Founder: Identify whether a Berlin Parkdeck venue exists and its exact official identity. Codex afterward: Reconcile it as distinct, outside-city, or stale.
- **RSO.Berlin:** The first-party site is client-rendered and Level 1 did not expose a future programme. Founder: Provide the actual first-party events/tickets URL visible in a normal browser. Codex afterward: Perform a policy-compliant Level 2 structural probe, retaining any public endpoint.
- **Lokschuppen:** The current rebrand is known, but the first-party programme failed in the bounded request. Founder: Confirm the current programme URL and whether it visibly lists future events. Codex afterward: Create a superseding investigation and test the client-rendered data path.
- **Panke:** The official site is current but no future programme was proven. Founder: Find the site's actual current programme/calendar link. Codex afterward: Probe that exact path and classify its acquisition mechanism.
- **OXI Garten:** The discovery-supplied site did not resolve and the relationship to OXI is unclear. Founder: Confirm whether OXI Garten is a separately programmed venue/room and provide its current official link. Codex afterward: Reconcile the identity and investigate only the surviving first-party source.

The machine-readable queue in `triage.json` records the uncertainty, the exact Founder input needed, and Codex's next action for each item.
