# London stable identity and offline proof 01

This investigation freezes the existing 45-record, nine-site Level-2 JSON-LD cohort. `verify-offline-proof.mjs` replays only retained captures and writes `cohort-audit.json`; it makes no network request. A record is promoted only when its retained first-party detail document publishes a canonical URL matching that document and the Event URL where one is supplied. This work does not activate any source or change public/canonical data.
