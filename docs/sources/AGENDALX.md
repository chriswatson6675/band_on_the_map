# AgendaLX Source Contract

Reviewed: 2026-08-23

## Source Identity

- Canonical source name: Agenda Cultural de Lisboa
- Publisher: Câmara Municipal de Lisboa
- Maintainer: Lisboa Aberta
- Source homepage: https://www.agendalx.pt/
- Lisboa Aberta dataset page: https://dados.cm-lisboa.pt/dataset/agenda-cultural-de-lisboa
- Verified live endpoint: https://www.agendalx.pt/wp-json/agendalx/v1/events
- Lisboa Aberta CKAN/DataStore resource ID observed from official API documentation snippet: `2b21c01d-6e14-4813-bb2f-c6fc10f10414`

Lisboa Aberta describes the dataset as data for events published in Agenda Cultural de Lisboa. Its metadata lists Câmara Municipal de Lisboa as author, Lisboa Aberta as maintainer, version `1.1`, real-time updating, source `https://www.agendalx.pt/`, and complementary API information at `https://agendalx.pt/api/`.

The Lisboa Aberta CKAN API endpoints returned Cloudflare `403` HTML to the Node probe from this environment, so the committed live fixture uses the official AgendaLX JSON endpoint instead. No HTML scraping fallback was used.

## Rights Assessment

- Licence: Creative Commons Attribution
- Licence/terms evidence:
  - Lisboa Aberta dataset page lists the dataset licence as Creative Commons Attribution.
  - Lisboa Aberta licence-filter page lists Agenda Cultural de Lisboa under `cc-by`.
  - Lisboa Aberta accessibility/legal text states the portal data is free to use, including commercial use, under CC0 or CC BY attribution terms.
- Rights class: GREEN
- Commercial display allowed: yes, with attribution
- Long-term storage allowed: yes, with attribution/provenance retained
- Redistribution allowed: yes, with attribution
- Attribution required: yes
- Terms/licence URL: https://creativecommons.org/licenses/by/4.0/ and https://lisboaaberta.cm-lisboa.pt/index.php/pt/acessibilidade

Rights metadata must remain attached to every source observation. If later production use exposes dataset-specific terms that differ from the portal-level CC BY evidence, this source definition must be reviewed before ingestion continues.

## Live Probe Result

Probe command:

```bash
node ingestion/agendalx/probe.mjs --output fixtures/agendalx/sample.json --sample-size 10
```

Result:

- Endpoint: `https://www.agendalx.pt/wp-json/agendalx/v1/events`
- HTTP status: `200`
- Content type: `application/json; charset=UTF-8`
- Response shape: JSON array
- Records observed in default response: `10`
- Fixture retained: `10` records
- Retrieval metadata is stored separately from raw records in `fixtures/agendalx/sample.json`.

The historical endpoint `https://www.agendalx.pt/wp-json/agendalx/v1/events/current` returned a JSON `404 rest_no_route` response and is not used.

## Observed Fields

The committed fixture preserves the original source record structure. Observed top-level fields:

- `id`: numeric source record ID.
- `type`: observed value `event`.
- `title.rendered`: rendered title string.
- `featured_media_large`: image URL.
- `subtitle`: array of subtitle strings.
- `subject`: broad category string, for example `artes` or `ciências`.
- `string_dates`: human-readable date range.
- `string_times`: human-readable time text.
- `description`: array of description snippets.
- `venue`: object keyed by venue slug. Observed nested fields include `id`, `slug`, `name`.
- `categories_name_list`: object keyed by category slug. Observed nested fields include `id`, `slug`, `name`.
- `tags_name_list`: object keyed by tag slug. Observed nested fields include `id`, `slug`, `name`.
- `link`: AgendaLX event URL.
- `occurences`: array of occurrence dates as `YYYY-MM-DD`. Source spelling is `occurences`.
- `StartDate`: current/next source start date in `YYYY-MM-DD`.
- `LastDate`: source end date in `YYYY-MM-DD`.
- `price_cat`: array of price category strings. The fixture includes values such as `unknown`.
- `price_val`: price text/value string. The fixture includes empty strings.
- `target_audience`: array.
- `accessibility`: array.

Fields not observed in the retained sample:

- direct latitude/longitude
- full venue address
- explicit ticket URL separate from `link`
- published or updated timestamp
- artist/performer field

## Music Classification Proof

The parser supports deterministic music classification by exact normalized values in source category/tag fields:

- `subject`
- `categories_name_list.*.name`
- `categories_name_list.*.slug`
- `tags_name_list.*.name`
- `tags_name_list.*.slug`

Supported values in the proof helper currently include `música`, `musica`, `music`, `concerto`, `concertos`, `concert`, `festival`, and `festivais`.

However, the single permitted live probe retained 10 default endpoint records and found:

- total sample records: `10`
- music-classifiable records in fixture: `0`
- observed sample subjects: mostly `artes`, plus `ciências`

Therefore this task proves that deterministic classification is technically possible from the observed source fields, but it does not prove current live music selection or coverage. A follow-up task must verify official query parameters or official CKAN/DataStore access that can retrieve music records without broad scraping or repeated probing.

## Venue, Location, And Coordinates

The retained sample provides venue identity as a source-scoped object:

- source venue ID
- venue slug
- venue name

The retained sample does not provide venue address or coordinates directly. Later ingestion must resolve venue identity and coordinates into canonical Venue records. Coordinates must not be independently trusted from every source record.

## Price And Ticket Findings

Observed price fields:

- `price_cat`: array, including `unknown` in the retained sample.
- `price_val`: string, empty in the retained sample.

Observed source/ticket link:

- `link`: public AgendaLX event page URL.

No separate ticket-provider URL was observed in the retained sample. Future ticket listings, prices, and URLs must map to Offers rather than being duplicated into canonical Events.

## Architecture Mapping

- Source: Agenda Cultural de Lisboa, with rights/provenance metadata from `sources/agendalx.json`.
- Observation: each raw AgendaLX record should become an Observation retaining `id`, endpoint, retrieval metadata, and original source payload.
- Artist: no source artist field was observed in the retained sample; extraction must not be invented.
- Venue: `venue.*.id`, `venue.*.slug`, and `venue.*.name` are source venue identifiers/labels that must later resolve to canonical Venue records.
- Event: raw records must not directly become canonical Events. Multiple Observations may later resolve to one canonical Event.
- Offer: `price_cat`, `price_val`, and any future ticket/source URLs belong in Offers.

Source-specific IDs such as AgendaLX `id` and venue IDs must never become the application's canonical identity scheme.

## Open Gaps Before Persistent Ingestion

- The default live endpoint response did not include music records.
- Official query parameters for selecting music records were not verified in this task.
- Lisboa Aberta CKAN/DataStore access returned Cloudflare HTML from the Node probe environment, despite official metadata/search snippets indicating a CKAN Data API resource.
- No venue coordinates or addresses were present in the retained fixture.
- No updated/published timestamp was present in the retained fixture.
