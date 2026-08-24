# Band on the Map — Agent Instructions

Read `docs/ARCHITECTURE.md` before touching ingestion, source, or Observation
code — it defines the canonical Source/Artist/Venue/Event/Observation/Offer
model and the rules that keep them separate.

## Before any event-source or venue-calendar investigation

**You MUST read `docs/SOURCE_INVESTIGATION_POLICY.md` in full before
investigating any event website, venue calendar, or candidate data source** —
whether the user asked for a full investigation or something that sounds
smaller ("check if this venue has a feed", "see what this site exposes").
That document is the canonical policy; this file only summarizes what to
never forget:

- **Scratchpad-only material findings are prohibited.** A finding used in an
  investigation decision that exists only in a scratchpad, temp file,
  terminal transcript, chat context, or your final report is not a finding
  this project recognises. It must be persisted under
  `research/source-investigations/<investigation-id>/` before the
  investigation counts as complete.
- **Retained investigation/evidence files are mandatory.** Identity,
  platform classification, discovered data paths, field assessments, and the
  decision all need cited, retained evidence — not prose claims.
- **Investigation must not activate a source unless explicitly authorised.**
  Reaching `READY_FOR_ACTIVATION` in an investigation record never edits
  `sources/*.json` or any registry. That is a separate, explicitly-approved
  action.
- **Unknown facts must never be invented.** No fabricated dates, years,
  times, timezones, venue identities, or stable record IDs — ever, even when
  a guess "looks obviously right".
- **Existing canonical/public data must not be mutated during
  investigation.** Never touch `data/public/*`, `venues/*.json` registries,
  `venues/manual-coordinates.json`, or `sources/*.json` as a side effect of
  research.

For everything else about how this project works day to day, `docs/`
already covers it — `docs/OBSERVATION_PIPELINE.md`, `docs/SOURCE_REGISTRY.md`,
and `docs/DATA_RIGHTS.md` are the other documents worth reading before
ingestion work.
