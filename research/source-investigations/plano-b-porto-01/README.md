# plano-b-porto-01

**This is a real trial investigation of a real venue/source candidate — not
activation.** Reaching a decision in `investigation.json` (here, `DEFER`) is
a research conclusion only. It does not edit `sources/*.json`, any
`venues/*.json` registry, or public map data. See "Investigation and
activation are separate" in `docs/SOURCE_INVESTIGATION_POLICY.md`.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## What was investigated

**Plano B** — an independent Porto club (jazz, rock, electronic,
experimental), R. de Cândido dos Reis 30, Baixa, Porto. This repository
already carried a loose, non-governed lead in `sources/porto.json`
(`plano-b-porto`), with `official_website: "https://www.planobporto.com"`,
`monitoring_status: "READY_FOR_TECHNICAL_PROOF"`, and a research note
explicitly saying it was "not directly fetched within this bounded
session". This investigation independently fetched and verified everything
from scratch, per policy.

## What actually happened: the candidate's official site is currently unreachable

**Level 1 (`PASSIVE_STATIC`) — `INSUFFICIENT`.** Every resolvable form of
the candidate's official domain was tried, and none returned any usable
content:

- `https://www.planobporto.com` (the exact `official_url` on record) is
  **DNS NXDOMAIN** — confirmed by two independent resolvers (this
  machine's own `nslookup`, and the WebFetch tool's own separate remote
  DNS resolution, which also failed with `getaddrinfo ENOTFOUND`).
- `https://planobporto.com` (bare domain, the only form that resolves at
  all) resolves to a real IP (`50.62.172.212`), but the **TLS handshake
  itself fails** on every attempt — reproduced across **three independent
  TLS client implementations** (curl/Schannel on this machine, PowerShell/
  .NET `Invoke-WebRequest` on this machine, and the WebFetch tool's own
  separate OpenSSL-based remote fetch infrastructure), from at least two
  independent network vantage points. This rules out a single client's
  misconfiguration.
- A plain, unencrypted **HTTP** (port 80) request to the same bare domain
  does reach a live Cloudflare-fronted edge — but that edge itself returns
  `HTTP 409` with the literal body `error code: 1001`, Cloudflare's own
  documented code for "DNS resolution error": even Cloudflare's own edge
  cannot reach whatever backend origin is configured for this hostname.
  Identical result for `/robots.txt`, ruling out a path-specific cause.

Because no HTML/JS/bootstrap content was ever obtained from the candidate's
own live site under any protocol or client, there was nothing for a genuine
Level 2 (`STRUCTURAL`) escalation to inspect — Level 2 requires actual
retained page content. Per policy's "DEFER does not require exhausting the
ladder", a single retained `INSUFFICIENT` Level 1 entry is legitimate
grounds for `DEFER` here, rather than fabricating a Level 2/3/4 attempt with
nothing real to act on.

## DEFER, not REJECT: distinguishing "site is down" from "venue is gone"

To answer that question honestly (without ever treating a third-party
source as first-party fact authority, per policy's "Third-party sources"
section), this investigation additionally retained:

- The Wayback Machine's own **CDX snapshot index** for this domain, showing
  it was genuinely live and publishing real, dated WordPress-shaped
  `/events/` and `/event/{slug}/` pages continuously from at least 2007
  through 2021 (real bookings: Kirk Knight, Jonas Rathsman, Cassy, "Aniversário
  Plano B", and a long-running weekly "NightShift" DJ series), before the
  root URL began returning `404` from **October 2022** onward. This is the
  site's *own* crawl history independently corroborating today's
  unreachability finding — it did not simply never work.
- A retained **2022-03-15 Wayback snapshot** of the homepage itself,
  self-identifying as `<title>PLANO B :: PROGRAMAÇÃO</title>` and linking
  its own `facebook.com/planobclub` / `instagram.com/planobporto`
  accounts — genuine first-party historical identity evidence, just not
  current.
- One retained fetch of **Songkick's own venue page** (used purely as a
  discovery-lead corroboration check, never as fact authority): its own
  JSON-LD repeats the same street address as the prior loose registry lead
  and lists several real, dated 2026 concerts at this venue. (Resident
  Advisor was also tried but returned a genuine DataDome bot-challenge —
  retained honestly as a `403`/blocked attempt, not bypassed.)

Together, this makes it very plausible the **real venue is still open and
booking real 2026 shows**, and that only its *website* is currently down —
a lapsed/misconfigured domain or hosting outage, not a closed business.
That is why the decision is `DEFER`, not `REJECT`: this candidate is not
being written off, just correctly marked as currently unacquirable.

## Field assessment: honestly UNKNOWN across the board

Every mandatory `field_assessment` key (`title`, `start_date`, `time`,
`end`, `venue_location`, `source_record_id`, `event_url`) — plus the
optional `price` — is recorded as `UNKNOWN`. There is no live page to
observe any of these fields on today. Historical/third-party signals exist
(past event pages, a matching street address on Songkick) but were
deliberately **not** promoted into claimed field values, per policy's
prohibition on treating a third-party aggregator as first-party authority
and its general prohibition on inventing/assuming facts.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, no-network script
that re-parses every retained evidence file and mechanically re-verifies
every unreachability and corroboration claim in `investigation.json` — the
DNS NXDOMAIN text, all three independent TLS handshake failure signatures,
the Cloudflare `409`/`error code: 1001` body, the CDX `200`-to-`404`
transition, the archived snapshot's own self-identification, and the
Songkick corroboration. `evidence/offline-proof-output.txt` is its captured
run: **26/26 checks passed**, exit code `0`.

## Decision: `DEFER`

Not `READY_FOR_ACTIVATION` (no live acquisition path exists — the site is
unreachable), not `REJECT` (strong evidence the real venue is still
operating; this is very plausibly a recoverable outage), not
`HUMAN_REVIEW` (nothing ambiguous or judgement-dependent remains to
resolve — the facts here are clear-cut), not `READY_FOR_OFFLINE_PROOF`
(there is no live sample to prove a parser against). A future
re-investigation should first simply re-probe both domain forms to see
whether they have recovered, and/or search for a replacement official
domain, before considering any alternative acquisition strategy — and
should be filed as a **new** investigation with `supersedes:
"plano-b-porto-01"`, per policy's "History and supersession" section, not
as an edit to this record.

## Validation

`node evidence/validate-mine.mjs` imports the real `validateInvestigation()`
from `ingestion/source-investigation/contract.mjs` and confirms this
record's `investigation.json` passes with **zero errors** under policy
`BOTM-SOURCE-INVESTIGATION-v1.2`.
