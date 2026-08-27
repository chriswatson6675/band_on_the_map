# ground-control-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Ground
Control, a multipurpose cultural/social venue at 81 rue du Charolais,
75012 Paris, including its named music sub-space "Charolais Club". Official
site: https://www.groundcontrolparis.com/

## The task's own question, answered honestly

The task brief specifically asked to verify — not assume either way —
whether concerts are genuinely and regularly programmed at "Charolais
Club" before treating this as a solid music venue. The rendered
`/programmation/` page itself never once mentions "Charolais Club", and
none of its 16 sampled upcoming cards read as a traditional concert.

Escalating to the site's own WordPress REST API resolved this properly,
with real evidence on both sides:

- **"Charolais Club" is real** — one actual post's own ACF field
  (`espace_lieu: ["Charolais Club"]`) confirms it as a genuine, currently-
  used sub-space name, not a hallucination from a prior pass.
- **But regular concert programming is not evidenced.** The site's
  `project_category` taxonomy does have real `concert` (45 historical
  posts), `dj-set` (64), and `musique` (43) categories — so concerts do
  happen — but filtering ALL of those to a genuinely **future**,
  structured `event_date_start` (≥ today) turned up only **two** usable
  upcoming records across a roughly 2–3 month window, one of them at
  Charolais Club. That is a thin, occasional volume, not a regular
  concert series, against a `/programmation/` page dominated by
  workshops, karaoke, drag shows, book/board-game festivals, and sports
  viewings.

A further honest caveat: the `event_date_start`/`event_date_end` ACF
fields that would make dates usable are **inconsistently populated** —
many historical concert-category posts have `event_date_start: null`.

## Decision

`DEFER`. This is a content-density/programming-regularity judgement, not
a technical acquisition failure — the WordPress REST API + ACF data path
genuinely works and is documented in the record. Activating this source
now would likely surface very few real, current music events for the
effort involved, and any future collector would need extra fallback logic
for the source's own inconsistent date field this investigation did not
attempt to design. No code was written for this venue. A human reviewer
may choose to re-investigate later (a new `investigation_id`, superseding
this one) if programming density changes, or accept the source anyway at
low expected volume — that call is deliberately left to a human.
