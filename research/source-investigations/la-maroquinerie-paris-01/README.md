# La Maroquinerie (Paris) — source investigation

See `investigation.json` for the authoritative record. This file is
explanatory only.

## Summary

La Maroquinerie's official events listing lives at `/fr/agenda/` on
`lamaroquinerie.fr` (explicitly NOT `la-maroquinerie.com`, an unrelated
leather-goods business — never fetched or used). It is a bespoke, legacy
PHP-templated site: 50 static `<li class="event">` cards, each with a
title, a stable numeric event ID embedded in its own detail-page URL
(`/fr/agenda/view/{id}/{slug}/`), a time-of-day, and a date — but that
date is **only `"DD monthname"`, never a year**, on either the list page
or a sampled per-event detail page.

## Why this is HUMAN_REVIEW, not READY_FOR_ACTIVATION or DEFER

This is a clean, fully first-party, non-hostile source — title, time,
venue, `source_record_id`, and `event_url` are all cleanly `PROVEN` with
`DIRECT_SOURCE` basis. The sole blocker is `start_date`: no year is
published anywhere this investigation could retain evidence for (list
page, one sampled detail page, and no JSON-LD/feed/sitemap exists to
check instead). Per policy v1.2, inferring a year from today's date would
be `AI_INFERENCE` and can never be marked `PROVEN` — so `start_date`
stays honestly `PARTIAL`.

One retained card (LOUVE) makes this concrete rather than theoretical:
its own free-text description states the show was postponed to `"24
février 2027"`, while its date card still shows `"30 septembre"` — a
naive "assume the current/next year" rule would have produced a
confidently wrong year for this exact, real event.

This is a genuine, permanent limitation of the source's own published
data, not an access/escalation problem a browser session could fix — so
`DEFER` (a source-quality failure) is not quite right either. The
honest outcome is `HUMAN_REVIEW`: a human operator could explicitly
authorise a documented year-assignment policy (e.g. a real-time
"nearest future occurrence" rule evaluated at actual collection time,
not at investigation time) as an `OPERATOR_DECISION` this investigation
cannot make on its own authority.

## Decision

`HUMAN_REVIEW`. No collector code was built in this pass (not required
for `HUMAN_REVIEW`); `collector_assessment.recommended_family` is
recorded as `STATIC_EVENT_LIST` (the family this source's *shape* matches,
independent of the year blocker) with a `MAJOR` blocker describing the
year gap.
