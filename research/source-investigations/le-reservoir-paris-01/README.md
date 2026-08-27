# le-reservoir-paris-01

Investigation of the assigned candidate "Le Réservoir" (small live-music
bar/venue, Bastille/Ledru-Rollin area, 11th/12th arrondissement, Paris),
part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`.

## Summary

A `WebSearch` discovery pass found no dedicated official website in its own
results — only third-party review/directory listings (TripAdvisor, Yelp,
sortiraparis, parisjazzclub, adhocmusic, bonplanaparis), consistently
describing a venue at 16 rue de la Forge Royale, 75011 Paris, still
apparently operating and hosting live music. One of those third-party
sources named a candidate official domain, `reservoirclub.com`.

Direct retrieval shows `reservoirclub.com` is an **unconfigured OVHcloud
hosting placeholder** ("Site not installed") over plain HTTP, and its
HTTPS variant **fails TLS certificate verification outright** — no valid
certificate is configured for the hostname at all. Six further plausible
domain-name guesses (with/without `www`, `.com`/`.fr`/`.paris`) all failed
DNS resolution entirely. No first-party official website exists for this
venue under any URL this investigation could locate.

## Decision

`REJECT`. Third-party sources are discovery leads, never first-party fact
authority, per policy — none of their content was used to populate any
`field_assessment` value. There is no honest acquisition path to build a
collector against a domain that has no functioning website behind it.

No coordinates were geocoded (out of scope for a REJECT decision — see
task step C).

## Evidence

- `evidence/home-raw.html`, `evidence/home-headers.txt` — the one
  candidate domain, confirmed to be an unconfigured hosting placeholder.
- `evidence/domain-guesses-probe.txt` — retained curl output for six
  further domain guesses, all failing DNS resolution or TLS verification.
