# mouco-porto-01

**This is a real investigation of a real venue/source candidate — not
activation.** `investigation.json` is the authoritative structured record;
this file is explanatory only and carries no independent authority, per
`docs/SOURCE_INVESTIGATION_POLICY.md`.

## What was investigated

**M.Ou.Co (Música e Outras Coisas)** — a combined hotel / concert-hall /
restaurant / "musicoteca" cultural venue in the Bonfim neighbourhood of
Porto, Portugal (Rua de Frei Heitor Pinto, opened 2021). Prior loose
research (mentioned in the task, not treated as evidence) flagged it as a
"real, evidenced Porto venue with apparent static listing, not yet
independently fetch-verified".

## Headline finding: the candidate's official domain does not currently resolve

The task-provided candidate URL, `https://www.moucohotel.pt`, **fails at
DNS resolution** — `curl` cannot even open a connection (`Could not resolve
host`, exit code 6). This investigation did not stop there:

1. Tried `https://moucohotel.pt` (no `www`) — same DNS failure.
2. Tried `https://mouco.pt` (the domain used for the venue's own contact
   email, `info@mouco.pt`, per discovery leads) — same DNS failure.
3. Ran a general network sanity check (`google.com`, and a known-good `.pt`
   domain from a prior investigation) — both succeeded normally, ruling out
   a broad local network/DNS problem.
4. Independently re-checked both `mouco.pt` and `moucohotel.pt` via a
   third-party DNS-over-HTTPS resolver (`dns.google`) — both report DNS
   `Status: 2` (`SERVFAIL`) with an explicit **"Name servers refused query
   (lame delegation?)"** comment, naming the domains' own delegated
   authoritative nameservers (`ns1`/`ns2.wtservers.com`) as the ones
   refusing to answer. This is a genuine, source-side DNS
   misconfiguration/outage — not a fluke of this investigation's own
   network.

Per the task's instructions, a bounded `WebSearch` was used **only as a
discovery lead** (never as evidence) to check whether a different official
domain existed. Every search consistently pointed back to the same
`moucohotel.pt` domain — no alternative live official domain was found.

## Third-party corroboration (discovery leads only, never identity authority)

Two independent third-party pages were fetched via `curl` and retained,
purely to check whether `moucohotel.pt` is genuinely the right domain (as
opposed to a wrong guess):

- `agenda-porto.pt`'s own venue listing for "Outsite M.Ou.Co." links
  directly to `https://moucohotel.pt/`.
- Time Out Porto's listing for "M.Ou.Co." links to `https://moucohotel.pt`
  and embeds a `schema.org` `PostalAddress` block with postal code
  `4300-081`, Porto — consistent with the task's stated Bonfim location.

Per `docs/SOURCE_INVESTIGATION_POLICY.md`'s "Third-party sources" section,
this is retained as corroboration of *which domain is the right candidate*,
never promoted to first-party identity proof or any field fact.

## What the last known live state looked like (Wayback Machine)

Because the live domain is unreachable, the Internet Archive's Wayback
Machine was checked (also via plain `curl`, never `WebFetch`) for the last
known live state. A snapshot from **2025-03-23** exists (`HTTP 200` at
capture time), well over a year before this investigation. That snapshot's
own retained headers and body show the domain was, even then, serving every
plain unauthenticated request an **anti-bot / anti-headless JS challenge
interstitial** — not real page or event content:

- Response headers preserve the original server identity:
  `x-archive-orig-server: imunify360-webshield/1.21` (a bot-challenge/WAF
  product).
- The body's `<title>` is `"One moment, please..."`, with visible text
  `"Please wait while your request is being verified..."` and an obfuscated
  script that explicitly tests `navigator.webdriver`, headless/`bytespider`
  user-agent strings, plugin/mimetype array shape, and zero
  `outerWidth`/`outerHeight` — textbook headless-browser fingerprinting.

This matters for the decision below: even if DNS is eventually restored,
the site appears to have been *actively engineered* to detect and block
automated clients, including headless browsers — the exact class of access
control this policy prohibits attempting to defeat.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted, and its outcome is
**`BLOCKED`** — both by the domain's current DNS unreachability and, per
the historical evidence above, by an explicit anti-bot access-control
challenge when the site did resolve. Escalation to Level 2 (`STRUCTURAL`)
or Level 3 (`BROWSER_OBSERVATION`) was **not** attempted:

- DNS resolution is a hard prerequisite for both a deeper structural
  inspection and a browser/headless session — neither can reach a host
  that does not resolve.
- Even setting DNS aside, the retained historical evidence indicates a
  browser session would face active headless-fingerprinting designed to
  block it; defeating that is explicitly prohibited by
  `docs/SOURCE_INVESTIGATION_POLICY.md`.

Per the policy's "DEFER does not require exhausting the ladder" section,
this is a legitimate, complete outcome as-is.

## Bounded sample

**Zero** events were captured. No first-party event data of any kind
(title, date, id, price, or otherwise) exists in any retained evidence
file — `evidence/offline-proof.mjs` includes an explicit anti-fabrication
check confirming this mechanically (it scans every retained file for a
`MusicEvent`/`Event` JSON-LD node and finds none).

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses the retained evidence files in this directory
and mechanically re-derives every structural claim above: both
DNS-over-HTTPS checks report `SERVFAIL`/lame-delegation, all three direct
`curl` attempts genuinely failed at DNS resolution, the Wayback snapshot
exists and shows the anti-bot challenge fronted by Imunify360 WebShield,
both third-party pages reference `moucohotel.pt`, and — the anti-fabrication
check — zero event data exists anywhere in retained evidence. Run with
`node evidence/offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt` and cited as the investigation's
`DETERMINISTIC_DERIVATION` evidence item. It exited `0` with every check
passing.

`evidence/check-validation.mjs` is a small ad-hoc script (not itself
retained as governed evidence) that imports the real
`validateInvestigationV1_1` from `ingestion/source-investigation/contract.mjs`
and confirms `investigation.json` validates cleanly.

## Decision: DEFER

`decision.status` is `DEFER`. This is not a rejection of the venue as a
candidate — the third-party corroboration is consistent and the venue is
clearly real and music-programmed — it honestly reflects that **no
acquisition path can currently be established** because the only known
official domain(s) do not resolve, and (per the best available historical
evidence) the site appears designed to challenge automated clients even
when reachable. `collector_assessment.blockers` records one `CRITICAL`
blocker (current DNS unreachability) and one `MAJOR` blocker (historical
anti-bot/anti-headless posture), which alone rule out
`READY_FOR_ACTIVATION` even before considering that no first-party event
data was ever retrieved.

## What a future investigator should know

- Re-check `https://moucohotel.pt` (and `https://mouco.pt`) periodically —
  if DNS resolution is restored, a fresh Level 1 `PASSIVE_STATIC` probe
  should be attempted first, exactly as policy requires, rather than
  assuming this record's `BLOCKED` finding still holds indefinitely.
- If the site does resolve again, expect it may still serve the same
  Imunify360 WebShield anti-bot interstitial to a plain `curl` request —
  this alone does not justify jumping straight to a browser session; the
  usual escalation ladder and its justification requirements still apply,
  and defeating explicit headless-fingerprinting remains prohibited by
  policy regardless of which probe level is reached.
- No collector family can be honestly recommended yet — `NEW_FAMILY_REQUIRED`
  was deliberately **not** claimed either, since that would imply enough
  was learned about the site's shape to know a new family is even the right
  answer, which is not the case here.
