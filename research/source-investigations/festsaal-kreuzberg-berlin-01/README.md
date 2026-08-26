# festsaal-kreuzberg-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30-40 venue collector-reuse trial. Investigates
Festsaal Kreuzberg (concert venue, Kreuzberg, Berlin) as an event-source
candidate.

## Summary

- Official first-party site: `https://festsaal-kreuzberg.de/`.
- Platform: Wagtail CMS (Django-based headless CMS), queried directly via
  its own standard, public, unauthenticated API v2 at
  `admin.festsaal-kreuzberg.de/api/v2/` — discovered from the frontend
  Nuxt app's own retained `window.__NUXT__.config.public.site.wagtailURL`.
  Same discovery pattern as `razzmatazz-barcelona-01`'s Sanity config, a
  different headless-CMS platform.
- Level 1 PASSIVE_STATIC was sufficient; no escalation was needed.
- `title`, `start_date`, `time`, `source_record_id` are `PROVEN`
  (`DIRECT_SOURCE`). `event_url` is `PROVEN` (`DETERMINISTIC_CONTEXT` —
  concatenating the confirmed official-site root with the record's own
  relative `url` field, live-verified).
- **Important finding**: `venue_location` is honestly `PARTIAL`, not
  `PROVEN`. This EventPage API is not scoped to Festsaal Kreuzberg alone —
  one sampled record ("Moka Efti Orchestra") has `location: null` and its
  own `ticket` URL literally names a different venue
  (Freilichtbühne Weißensee). A future collector must not default a null
  `location` to "Festsaal Kreuzberg" — recorded as a `MAJOR` blocker.
- `price` is `PARTIAL` (present as a raw comma-decimal string on some
  records, `null`/free-text-only on others).
- Decision: `READY_FOR_OFFLINE_PROOF` — no offline
  parser/`DETERMINISTIC_DERIVATION` proof was produced in this
  investigation, and `venue_location` is not fully resolved, so
  `READY_FOR_ACTIVATION` is not appropriate yet. Recommended collector
  family: `JSON_API` (existing, reusable family).
