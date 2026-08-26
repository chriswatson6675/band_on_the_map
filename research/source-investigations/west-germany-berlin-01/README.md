# west-germany-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue source-investigation trial (BOTM-source-investigation
policy `v1.2`). Investigates West Germany, a club above Bar Fahimi near
Kottbusser Tor (Skalitzer Str. 133, Berlin).

## Summary

The only candidate official domain found via WebSearch (`westgermany.de`,
matching the venue's publicly-listed contact email `info@westgermany.de`)
returns a consistent, edge-level HTTP 403 Forbidden (an openresty anti-bot
pattern) on every path, protocol (HTTP/HTTPS), subdomain (bare/`www`), and
User-Agent tried (both a plain descriptive research UA and a full
desktop-browser UA). No page content was ever retrievable. No alternative
first-party domain exists — every other source found (Songkick, Dice.fm,
Resident Advisor, clubguideberlin.de, bpigs.com, Instagram) is either a
third-party aggregator/ticketing page or lists no website at all.

## Decision

`DEFER` — a single Level 1 `BLOCKED` probe is a legitimate, complete
investigation outcome per `docs/SOURCE_INVESTIGATION_POLICY.md`: `BLOCKED`
terminates escalation, and the correct response to an explicit access-control
boundary is `DEFER`/`HUMAN_REVIEW`, never an attempt to bypass it (no
CAPTCHA-defeat, header spoofing beyond a plain UA, or other evasive
technique). `identity.status` is honestly `AMBIGUOUS` — the domain-to-email
match is plausible but was never corroborated against actual rendered
content.

Revisit later (as a new investigation superseding this one) if the block
condition changes or a genuine alternative first-party channel is found.

## Evidence

- `evidence/domain-403-modua.html` — 403 response using a plain descriptive
  research User-Agent.
- `evidence/domain-403-browserua.html` — 403 response using a full
  desktop-browser User-Agent, confirming the block is UA-independent.
