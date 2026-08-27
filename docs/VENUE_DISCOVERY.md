# Venue discovery

Venue discovery answers **“what venues might exist?”** It does not establish canonical Venue facts and does not answer **“what events does this venue publish?”** The latter requires an official first-party programme and the governed process in `docs/SOURCE_INVESTIGATION_POLICY.md`.

## Architecture

Provider adapters return `VenueDiscoveryCandidate[]`. Each lead retains its provider record ID, URL, retrieval time, reported name/address/coordinates/site/category, evidence, and optional status or music hints. Hints remain reported claims. Adapters cannot write source, venue, or publication registries.

The deterministic pipeline is:

```text
provider observations
  -> candidate validation and normalisation
  -> strong-signal deduplication
  -> ambiguous-match review flags
  -> existing BeatMapped registry reconciliation
  -> retained candidate census
  -> explicit official-source resolution and governed investigation
```

Strong merges require a shared provider ID, exact website domain, exact normalised name plus full address/postcode, or exact name plus coordinates within 40 metres. Fuzzy name similarity alone never merges. Exact name-only matches remain separate with `POSSIBLE_DUPLICATE_REVIEW`.

Reconciled candidates preserve every provider observation. Coverage signals are deterministic: provider count, website/address presence, registry presence, provider agreement/conflict, and `HIGH`/`MEDIUM`/`LOW` semantics. They are not numerical probabilities.

## Provider convention

An adapter has a stable `providerId` and `discover(input, context)` method. It may consume a network response, retained JSON/HTML fixture, or manual/curated list, but must return only candidates. `runProviderAdapter()` validates provider isolation and the common contract.

The Berlin proof includes:

- OpenStreetMap/Overpass: documented venue, nightclub, live-music, concert-hall, relevant music arts-centre, and festival-ground signals. The query is retained and location configuration is outside the parser.
- Berlin Open Data: the CC BY “Standorte geförderter Kultureinrichtungen” workbook, deterministically filtered to broad theatre, opera, concert-hall, and funded-performance-venue signals. It was published in 2016, so every lead has an `UNKNOWN_DATASET_PUBLISHED_2016` status hint and must be checked for current identity/status.
- BeatMapped’s Berlin source and venue estate, used for reconciliation.

MIZ is deliberately excluded because its current privacy notice expressly prohibits automated or bulk copying of its databases. Ticketing/gig directories, Songkick, and other licensed APIs are also excluded because no permission or licence was established for this package. General web results can be imported later through the curated/manual adapter; this package does not crawl search engines. Operator portfolios can use that same adapter when their public reuse terms and provenance are recorded.

## Future-city usage

Generic modules accept arbitrary city and country context. A city package supplies provider configuration and retained inputs, then calls `buildDiscoveryCensus()`. The retained Berlin proof can be regenerated with:

```sh
npm run discover:venues -- --city=Berlin --country=DE
```

The bundled CLI intentionally rejects other cities because its retained evidence files are Berlin-specific; future packages should point the same generic modules at their own bounded fixtures rather than silently reusing Berlin data.

The handoff is always explicit:

```text
DISCOVERED_CANDIDATE
  -> OFFICIAL_SOURCE_RESOLUTION
  -> SOURCE_INVESTIGATION
  -> READY_FOR_ACTIVATION
  -> COLLECTOR
```

Discovery never writes `sources/*.json`, `venues/*.json`, event data, or deployment state.
