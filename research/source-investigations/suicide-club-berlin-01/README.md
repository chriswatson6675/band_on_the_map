# suicide-club-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

## Summary

Suicide Club Berlin / Suicide Circus rebranded to "Lokschuppen Berlin" in
2024 (per Berlin.de's own club directory and Wikipedia). Its domain,
`https://lokschuppen-berlin.com/`, currently serves only a client-rendered
Readymag design-tool placeholder page (`<meta name="generator" content="Readymag">`,
`noindex,nofollow`, title "LOKSHUPPEN NEW WEB") with no server-rendered text
at all — no venue description, no programme, no JSON-LD, no ICS, no
WordPress/Tribe signature, no Fourvenues script, no Sanity config. The
site's own linked `/contact` path redirects straight back to the same
placeholder shell, confirming no distinct content pages currently exist.

Level 2 inspected the page's own inline Readymag bootstrap configuration
(decoded from the initial HTML, no JS execution needed) and found only
visual-canvas/design-tool metadata (fonts, colours, layout) — nothing
resembling event data or a discoverable content API.

## Decision

`DEFER`. The domain appears to be an in-transition placeholder following
the 2024 rebrand, with no usable content today. Official identity is only
`PARTIAL` (corroborated via third-party discovery, not self-stated on the
retained page). Revisit once the post-rebrand site is genuinely populated.

## Evidence

See `evidence/` — the homepage, its response headers, and the `/contact`
redirect target, all retained byte-faithfully via `curl`.
