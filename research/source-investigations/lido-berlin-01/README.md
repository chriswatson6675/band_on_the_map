# lido-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue reuse trial. Lido's own homepage (`lido-berlin.de`,
which doubles as its programme page) links to individual event pages; each
one embeds a single schema.org `MusicEvent` JSON-LD block directly in
server-rendered HTML — the same acquisition pattern already proven for Moog
Barcelona (`ingestion/json-ld/`), requiring zero new collector code.

Three real, currently-listed events (Shakey Graves, Jorja Smith, Buzzcocks)
were sampled to confirm the pattern is consistent. One honest caveat is
recorded rather than silently smoothed over: every sampled event's
`startDate` states a `+00:00` UTC offset that does not match Berlin's actual
summer offset — the time-of-day digits corroborate the page's own separately
rendered "Doors" text, so the wall-clock time itself looks reliable, but the
offset annotation should be treated as unreliable (likely FLOATING_LOCAL, not
genuine UTC) until a future collector-build step verifies it further.

Decision: `READY_FOR_OFFLINE_PROOF` — a real, bounded, retained sample
exists and every gate-relevant field is honestly assessed, but no collector
code or `DETERMINISTIC_DERIVATION` offline-proof evidence was produced in
this investigation-only task.
