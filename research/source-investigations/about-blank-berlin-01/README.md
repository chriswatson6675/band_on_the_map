# about-blank-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin venue-population trial (`BOTM-DIFFICULT-SOURCE-TRIAL-01`
methodology reused for Berlin). Investigates ://about blank, a club in
Friedrichshain, Berlin, near Ostkreuz.

## Summary — genuinely, deliberately minimal

About Blank's former domain (`aboutparty.net`) redirects to its current
official domain, `aboutblank.li`: a ~1.8KB hand-written, plain HTML4 page
with no CMS, no JS framework, and no client-rendered shell of any kind. Its
own "VORSCHAU" (preview/upcoming) page — the closest thing to a programme —
contains **no event text whatsoever**: the entire "programme" is a single
static poster JPEG (`current.jpg`), confirmed by a HEAD request.

This matches the venue's well-documented anti-marketing, DIY culture
exactly as the task anticipated. There is no JS bootstrap or bootstrap-data
blob that a Level 2 structural probe could plausibly find something behind
— it is not a client-rendered SPA hiding an API, it is a static page with
one image on it.

## Decision

`DEFER` — a single, genuinely `INSUFFICIENT` Level 1 probe is sufficient
grounds to defer here per policy ("DEFER does not require exhausting the
escalation ladder"); escalating further would not be a real attempt to find
something, since there is no framework, bundle, or endpoint behind this
page to inspect. This is an honest, complete outcome, not a shortcut.
