# loophole-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue source-investigation trial (BOTM-source-investigation
policy `v1.2`). Investigates Loophole, a small experimental live-music venue
in Berlin-Neukölln.

## Summary

The first domain surfaced by search (`loophole-berlin.com`) turned out on
direct inspection to be an unrelated parked/for-sale domain — correctly
rejected rather than assumed to be the venue (see
`evidence/parked-domain-loophole-berlin-com.html`). A second, more specific
search found the venue's likely real official domain, `loophole.berlin`, but
every path attempted on it (homepage, `/press-statement/`, `/robots.txt`,
`/sitemap.xml`) returned a genuine server-side error (HTTP 403 or 500), never
actual page content. This is consistent with independent discovery-lead
context (not treated as source authority) that the physical venue was banned
from hosting concerts by the Ordnungsamt Berlin in July 2024 and has been
seeking a new location.

## Decision

`DEFER` — no event data, platform fingerprint, or even a rendered homepage
could be retrieved from the venue's real domain; `identity.status` is
honestly recorded as `AMBIGUOUS` (strong circumstantial evidence tying the
domain to the venue via its own error-page hosting contact, but no genuinely
rendered content ever confirmed it directly). This is a legitimate, complete
investigation outcome per `docs/SOURCE_INVESTIGATION_POLICY.md` — there was
nothing further a Level 2 structural probe could inspect, since every
response is a bare server-generated error page with no application content
of any kind.

Revisit later (as a new investigation superseding this one) if/when the
venue relaunches at a new location with a working site.

## Evidence

- `evidence/official-domain-403.html` — real domain homepage, HTTP 403.
- `evidence/official-domain-press-statement-500.html` — real domain
  `/press-statement/`, HTTP 500 (error page names a hosting contact tying
  the domain to the venue).
- `evidence/official-domain-robots-500.html` — real domain `/robots.txt`,
  HTTP 500 (confirms the failure is not path-specific).
- `evidence/parked-domain-loophole-berlin-com.html` — the rejected
  parked/for-sale domain, retained to document why it was ruled out.
