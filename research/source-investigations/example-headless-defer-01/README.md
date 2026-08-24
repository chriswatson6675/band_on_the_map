# example-headless-defer-01 (SYNTHETIC GOVERNANCE FIXTURE)

This is not a real investigation of a real venue. It is a synthetic
example committed under `BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01` proving
that **`DEFER` is a legitimate, fully-validating investigation outcome** —
not a failure state, and not something the validator treats as
second-class to `READY_FOR_ACTIVATION`.

The scenario: a candidate whose public page is an empty client-rendered
shell (`CLIENT_RENDERED`). Level 1 (passive/static) and Level 2
(structural) inspection found nothing usable; escalating to Level 3
(browser observation) was judged not worth doing for this synthetic
low-priority fixture. Per
`docs/SOURCE_INVESTIGATION_POLICY.md`'s escalation ladder, the correct,
honest outcome is `DEFER` — not guessing at an acquisition path to force
coverage.

`official_url` points at `https://example.net/events` — `example.net` is
reserved by IANA for documentation (RFC 2606) and is never a real
live-music venue. `evidence/shell.html` was authored directly for this
fixture, not fetched from a live site.

This fixture also demonstrates that an optional field-assessment key
(`price`) can be omitted entirely without blocking validation — see
`field_assessment` in `investigation.json`, which has no `price` key at
all.

`investigation.json` is the authoritative structured record. This file is
explanatory only.
