# musik-frieden-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue reuse trial. Musik & Frieden (Falckensteinstraße 47/48,
Kreuzberg) was one of six real venues assigned for investigation, but a single
Level 1 PASSIVE_STATIC fetch of its historically-known domain
(`musikundfrieden.de`) showed it now permanently redirects to `hole-berlin.de`
— the official site of a *different* venue (Hole Berlin / Hole44, Neukölln),
not a rename or relaunch of Musik & Frieden. Independent third-party
discovery leads (used only as leads, never as fact authority, per
`docs/SOURCE_INVESTIGATION_POLICY.md`'s "Third-party sources" section)
corroborate that Musik & Frieden closed in 2020.

Since there is no current official first-party presence for this candidate,
the investigation was concluded at Level 1 with `decision.status: "REJECT"`
rather than `DEFER` — this is not an acquisition-method gap on a live
candidate, it is the absence of a going candidate altogether. See
`evidence/` for the retained redirect response and the redirect target's own
identifying content.

If Musik & Frieden reopens under a verifiable official presence in future, a
new investigation should be recorded citing
`"supersedes": "musik-frieden-berlin-01"` — this record is never rewritten in
place.
