# postbahnhof-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30-40 venue collector-reuse trial. Investigates
Postbahnhof (former multi-hall concert venue, Friedrichshain, Berlin) as an
event-source candidate.

## Summary

This investigation could not get past `CANDIDATE_IDENTITY`. Every plausible
domain for this candidate was checked with a plain, unauthenticated HTTP
request and retained as evidence, and none is genuinely this candidate's
own first-party official presence:

- `postbahnhof.com` — the domain most third-party listings cite as
  "official" — is now a commercial real-estate/office-leasing marketing
  site for the physical building (operated by BNP Paribas Real Estate /
  PATRIZIA AG). It has no event/programme content at all.
- `fritzclub.com` — the historic in-building club brand — is an unrelated
  generic WordPress site with zero occurrences of "Berlin" anywhere in its
  retained content.
- `postbahnhof-berlin.de` is a parked/expired domain that 303-redirects to
  an ad network and then serves a Cloudflare bot-challenge page.

Unretained secondary/search context (not used as source evidence, only as
investigative background) is consistent with this: multiple sources
describe the Postbahnhof halls being sold and largely repurposed away from
regular concert/club use since around 2019-2021, with only third-party
ticket aggregators still occasionally listing bookings at the address —
which this policy explicitly treats as a discovery lead, never first-party
authority.

- Decision: `DEFER`. `identity.status` is honestly `UNKNOWN` (not
  `NOT_PRESENT` — it is not proven no official presence exists anywhere,
  only that this investigation's checks could not find one).
  `site_classification.acquisition_class` is `UNKNOWN` and no data path,
  field assessment, or collector family could be established. If a genuine
  current first-party presence is later identified, a **new** investigation
  should supersede this one (per the policy's supersession rule) rather
  than rewriting it in place.
