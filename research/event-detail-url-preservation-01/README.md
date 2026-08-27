# Event detail URL preservation audit

This package records the read-only publication impact of losing explicitly
fetched event-detail URLs before they reach `Observation.event_url`.

`publication-audit.json` is generated mechanically from the committed map
artifact by `build-publication-audit.mjs`. It does not refetch sources,
modify registries, publish data, or activate anything.

The runtime rule is documented in `docs/OBSERVATION_PIPELINE.md`: technical
provenance and user-facing links are related but not synonymous. Only an
explicitly identified individual detail page may fill a missing event URL;
programme, API, feed, and search URLs remain provenance only.
