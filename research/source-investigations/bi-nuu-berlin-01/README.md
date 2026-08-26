# bi-nuu-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue reuse trial. Bi Nuu's homepage (`binuu.de`) is a
client-rendered SvelteKit shell (Level 1 PASSIVE_STATIC was genuinely
INSUFFICIENT — no server-rendered event markup at all). Level 2 STRUCTURAL
escalation used SvelteKit's own well-documented routing convention — every
route's server-loaded data is also served at `{route}/__data.json` — and a
plain unauthenticated GET of that convention returned real, structured event
data directly: no browser or network-tab observation was needed.

The data itself is `devalue`-encoded (SvelteKit's flat-array reference
serialization), which this project has no existing parser for — hence
`recommended_family: "NEW_FAMILY_REQUIRED"`, though the format is small and
generic enough to be a real, reusable module rather than a one-off hack.

One field-level nuance worth a human's attention before collector-build:
`locationArticle`/`locationNew` fields exist on the record and were observed
populated on one sampled event (a relocated show), so a future collector
must not assume every record is at Bi Nuu itself.

Decision: `READY_FOR_OFFLINE_PROOF` — a real, bounded, retained sample (46
listing records + 1 full detail record) exists and every gate-relevant field
is honestly assessed, but no collector code or `DETERMINISTIC_DERIVATION`
offline-proof evidence was produced in this investigation-only task.
