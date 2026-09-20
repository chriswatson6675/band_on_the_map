// Shared fixtures for future-city-wave tests. Fake cities/venues only —
// never a real Wave-1 city — matching this repository's own existing
// convention (tests/source-execution.test.mjs, tests/global-easy-harvester/).

export const FAKE_CITIES = Object.freeze([
  { city_id: "testville-tv", name: "Testville", country: "Testland", country_code: "TV", nominatim_countrycodes: "tv", tier: "MAJOR", reason: "fixture", wave_id: "test-wave-01", acquisition_tier: 1, enabled: true },
  { city_id: "otherburg-tv", name: "Otherburg", country: "Testland", country_code: "TV", nominatim_countrycodes: "tv", tier: "SMALLER", reason: "fixture", wave_id: "test-wave-01", acquisition_tier: 1, enabled: true },
  { city_id: "disabled-tv", name: "Disabledton", country: "Testland", country_code: "TV", nominatim_countrycodes: "tv", tier: "SMALLER", reason: "fixture", wave_id: "test-wave-01", acquisition_tier: 1, enabled: false },
]);

export const jsonLdPage = (url) => ({
  url,
  at: "2026-01-01T00:00:00.000Z",
  status: 200,
  content_type: "text/html",
  body:
    '<link rel="canonical" href="/events/a"><script type="application/ld+json">' +
    '{"@context":"https://schema.org","@type":"Event","name":"A","startDate":"2099-09-01T20:00:00+01:00","url":"/events/a"}</script>',
});

export const plainPage = (url) => ({ url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html", body: "<html><body><p>Nothing structured.</p></body></html>" });

export const homepageWithEventsLink = (url) => ({ url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html", body: '<html><body><nav><a href="/events">Events</a></nav></body></html>' });

/**
 * OSM discovery candidates only ever carry a `website`, never a
 * `programme_url` (see candidate.mjs) — acquireSource() therefore always
 * routes through its own bounded homepage-navigation discovery
 * (programme-resolver.mjs) before it ever sees a JSON-LD/static-cards
 * page. A fixture that only returns jsonLdPage for every URL (including
 * the homepage) never gives resolveProgrammeSource() a discoverable
 * "events"-like <a href> link, so it can never resolve past
 * PROGRAMME_SOURCE_UNRESOLVED — this two-tier fetch is what a real
 * "Tier-1 proven" fixture for this package's candidates needs.
 */
export function homepageDiscoveryFetch(host) {
  return async (url) => (url === host || url === `${host}/` ? homepageWithEventsLink(url) : jsonLdPage(url.includes("/events/a") ? url : `${host}/events/a`));
}

export function makeFetchDocument(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [prefix, handler] of routes) {
      if (url.startsWith(prefix)) return handler(url);
    }
    throw new Error(`makeFetchDocument: no fixture registered for "${url}"`);
  };
  fn.calls = calls;
  return fn;
}

/** A fake OSM-shaped VenueDiscoveryCandidate, matching ingestion/venue-discovery/contract.mjs's shape. */
export function fakeDiscoveryCandidate({ name, city, countryCode, website = null, lat = 1, lon = 1, id }) {
  return {
    candidate_id: `cand-osm-node-${id}`,
    city,
    country_code: countryCode,
    reported_name: name,
    reported_address: null,
    reported_latitude: lat,
    reported_longitude: lon,
    reported_website: website,
    reported_category: "amenity=nightclub",
    discovery_provider: "OPENSTREETMAP_OVERPASS",
    provider_record_id: `node/${id}`,
    provider_url: `https://www.openstreetmap.org/node/${id}`,
    retrieved_at: "2026-01-01T00:00:00.000Z",
    discovery_evidence: [{ kind: "OSM_ELEMENT", value: `node/${id}` }],
    music_relevance_hint: null,
    active_status_hint: null,
    official_site_hint: website,
  };
}

/** Fake, injectable geocode/discover functions keyed by city_id. */
export function makeFakeGeocode(byCityId) {
  return async (city) => byCityId[city.city_id] ?? null;
}

export function makeFakeDiscover(byCityId) {
  return async (city) => byCityId[city.city_id] ?? { candidates: [], error: null };
}
