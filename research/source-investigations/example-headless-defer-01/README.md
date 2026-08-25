# example-headless-defer-01 (SYNTHETIC GOVERNANCE FIXTURE)

This is not a real investigation of a real venue. It is a synthetic
example committed under `BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01` and
extended by `BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01A` to prove two
things together:

1. **`DEFER` is a legitimate, fully-validating investigation outcome** —
   not a failure state, and not second-class to `READY_FOR_ACTIVATION`.
2. **A full, honest escalation through the ladder — including reaching a
   legitimate `BLOCKED` boundary at Level 3 — validates, and `BLOCKED`
   terminates escalation rather than justifying a Level 4 attempt.**

The scenario, told through `probe_history`:

- **Level 1 (`PASSIVE_STATIC`) — `INSUFFICIENT`.** The initial HTTP
  response is an empty client-rendered shell (`evidence/shell.html`).
- **Level 2 (`STRUCTURAL`) — `INSUFFICIENT`.** The public JS bundle
  (`evidence/bundle-excerpt.js`) references an internal data endpoint but
  exposes no public JSON/feed/API path of its own.
- **Level 3 (`BROWSER_OBSERVATION`) — `BLOCKED`.** A controlled browser
  session (`evidence/network-log.json`) confirms the only endpoint
  serving event data requires an authenticated session cookie — a
  legitimate access-control boundary, not something this framework
  acquires or bypasses (see
  `docs/SOURCE_INVESTIGATION_POLICY.md`'s forbidden-behaviour rules).

`BLOCKED` terminates escalation, so no Level 4 entry follows — the
correct, honest outcome is `decision.status: "DEFER"`, not an attempt to
work around the session requirement.

`official_url` points at `https://example.net/events` — `example.net` is
reserved by IANA for documentation (RFC 2606) and is never a real
live-music venue. All three evidence files were authored directly for
this fixture, not fetched from a live site or a real browser session.

This fixture also demonstrates that an optional field-assessment key
(`price`) can be omitted entirely without blocking validation — see
`field_assessment` in `investigation.json`, which has no `price` key at
all.

`investigation.json` is the authoritative structured record. This file is
explanatory only.
