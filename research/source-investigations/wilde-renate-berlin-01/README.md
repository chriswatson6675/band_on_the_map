# wilde-renate-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin venue-population trial (`BOTM-DIFFICULT-SOURCE-TRIAL-01`
methodology reused for Berlin). Investigates Wilde Renate (Salon zur wilden
Renate), a club in Friedrichshain, Berlin, near Ostkreuz.

## Summary

Renate's official site (`https://www.renate.cc/`) embeds its entire
programme directly in a server-rendered accordion on the homepage — 18 real
upcoming event rows (day, date, title, category, room breakdown where
present, ticket link) with no separate calendar page or CMS calendar API.

## The honest limitation: no year, no first-party identifier

Two genuine, undecorated gaps kept this at `READY_FOR_OFFLINE_PROOF` rather
than a stronger position:

1. **No year is stated anywhere** near the programme — only `DD.MM.` per
   row. The 18 sampled rows run chronologically without wraparound (15.08.
   through 29.10.), which makes the current year highly plausible, but
   `docs/SOURCE_INVESTIGATION_POLICY.md` explicitly forbids exactly that
   kind of "today's date makes it likely" reasoning as a basis for a
   `PROVEN` value (see its worked-examples table). `start_date` is recorded
   honestly as `PARTIAL`, not guessed.
2. **No per-event permalink or ID exists on Renate's own domain.** Every
   event is a row in one shared page, not its own URL. The only ID
   anywhere is a Resident Advisor (third-party) numeric ID embedded in each
   row's outbound ticket link — documented as an honest alternative-identity
   consideration, not claimed as this source's own proven identifier.

## Decision

`READY_FOR_OFFLINE_PROOF` — identity PROVEN, acquisition_class STATIC_HTML
resolved, a CONFIRMED public data path, `title` PROVEN. Unlike the cleaner
Berghain/Tresor cases, this status reflects genuinely unfinished design
work (the year-ambiguity and identifier gaps above), not merely a missing
formality — a future collector-build step will need real decisions here,
not just an offline-proof script.
