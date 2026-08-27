# le-divan-du-monde-paris-01

Investigation of the assigned candidate "Le Divan du Monde" (75 Boulevard
de Rochechouart, 75018 Paris), part of
`BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`.

## Summary

`divandumonde.com` is genuinely this candidate's own registered domain
(its JSON-LD `Organization` block states `name: "Divan du Monde"`, its own
logo, and matching Facebook/Instagram links) — but the page carries
essentially zero real content: a page title, a logo, and a stale
`© 2023 Divan du monde - Madame Arthur.` footer notice. No agenda,
programme, or events listing exists anywhere on the site. Its own single
"RÉSERVATION" call-to-action button links to `https://club.madamearthur.fr/`,
a domain that **does not resolve at all** (DNS failure). Its `/en` subpath
failed independently on two separate attempts (an HTTP 500, then a
connection timeout minutes later); `/fr` silently redirects back to the
same near-empty home page.

Following this thread led to `madamearthur.fr` ("Madame Arthur - Cabaret
Club"), the physical venue's actual currently-operating brand. That site's
own retained "notre histoire" text states directly: *"En 2015, Madame
Arthur et le Divan fusionnent pour créer le Cabaret-Club que l'on connait
aujourd'hui"* ("In 2015, Madame Arthur and the Divan merged to create the
Cabaret-Club we know today"). This is a first-party-evidenced identity
merger, not a guess: "Le Divan du Monde," as an independent brand with its
own maintained official presence, genuinely no longer exists.

## Decision

`REJECT`. The assigned candidate's own official domain has no maintained
first-party event content, and continuing to investigate it as if it did
— or silently substituting "Madame Arthur" as though it were the same
assignment — would both misrepresent what was actually found. If this
project wants coverage of the physical venue at this address, that would
need a separate, distinctly-scoped investigation of "Madame Arthur" (a
different identity, primarily a cabaret/drag/DJ-club format).

No coordinates were geocoded (out of scope for a REJECT decision — see
task step C).

## Evidence

- `evidence/home-raw.html`, `evidence/home-fr-raw.html` — the candidate's
  own near-empty official pages.
- `evidence/club-madamearthur-probe.txt` — retained curl output proving
  the site's own reservation link does not resolve, and that `/en` fails.
- `evidence/madamearthur-raw.html` — the physical venue's actual current
  brand, retained ONLY to establish the identity-merger finding.
