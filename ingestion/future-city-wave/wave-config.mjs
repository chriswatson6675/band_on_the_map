// BEATMAPPED-FUTURE-CITY-WAVE-01-TIER1-EXPANSION-01 — the CITY WAVE
// concept, kept strictly distinct from ACQUISITION TIER (see
// controller.mjs/tier1-gate reuse). City names/config live ONLY here —
// no orchestration module hardcodes a city name.
//
// SELECTION RATIONALE (Wave 1, 24 cities, 10 countries): stayed within
// Europe deliberately — this repository's 6 already-covered metros
// (Berlin/London/Paris/Barcelona/Lisbon-metro/Porto-metro) are all
// European, so source-structure patterns (WordPress/EventON, JSON-LD,
// squarespace-eventlist, first-party rights norms) this project's
// existing collectors already understand are most likely to transfer
// within Europe; a genuinely different market (US/Asia/etc.) is a
// reasonable candidate for a LATER wave, not this bounded one. Within
// Europe, the wave deliberately mixes major markets, secondary cities,
// and smaller high-activity music cities (16 of 24 are NOT national
// capitals) rather than picking European capitals only, per this
// package's brief.
export const WAVE_1_ID = "future-city-wave-01";

export const WAVE_1_CITIES = Object.freeze([
  { city_id: "manchester-gb", name: "Manchester", country: "United Kingdom", country_code: "GB", nominatim_countrycodes: "gb", tier: "SECONDARY", reason: "Major independent/electronic and Britpop heritage scene, historically underserved relative to London-centric platforms." },
  { city_id: "glasgow-gb", name: "Glasgow", country: "United Kingdom", country_code: "GB", nominatim_countrycodes: "gb", tier: "SECONDARY", reason: "UNESCO City of Music; dense independent club/venue scene distinct from London." },
  { city_id: "bristol-gb", name: "Bristol", country: "United Kingdom", country_code: "GB", nominatim_countrycodes: "gb", tier: "SMALLER", reason: "High-activity independent/electronic scene in a smaller metro." },
  { city_id: "hamburg-de", name: "Hamburg", country: "Germany", country_code: "DE", nominatim_countrycodes: "de", tier: "MAJOR", reason: "Major German market with a large, distinct venue estate from Berlin." },
  { city_id: "munich-de", name: "Munich", country: "Germany", country_code: "DE", nominatim_countrycodes: "de", tier: "MAJOR", reason: "Major German market, large population, sizable venue estate." },
  { city_id: "cologne-de", name: "Cologne", country: "Germany", country_code: "DE", nominatim_countrycodes: "de", tier: "SECONDARY", reason: "Large secondary German market with a substantial club/concert scene." },
  { city_id: "leipzig-de", name: "Leipzig", country: "Germany", country_code: "DE", nominatim_countrycodes: "de", tier: "SMALLER", reason: "Smaller but historically dense music city, testing the smaller-city proposition." },
  { city_id: "amsterdam-nl", name: "Amsterdam", country: "Netherlands", country_code: "NL", nominatim_countrycodes: "nl", tier: "MAJOR", reason: "Establishes a Dutch foothold; major, dense venue scene." },
  { city_id: "rotterdam-nl", name: "Rotterdam", country: "Netherlands", country_code: "NL", nominatim_countrycodes: "nl", tier: "SECONDARY", reason: "Strong independent/electronic scene distinct from Amsterdam." },
  { city_id: "utrecht-nl", name: "Utrecht", country: "Netherlands", country_code: "NL", nominatim_countrycodes: "nl", tier: "SMALLER", reason: "Smaller Dutch city with meaningful recurring live programming." },
  { city_id: "brussels-be", name: "Brussels", country: "Belgium", country_code: "BE", nominatim_countrycodes: "be", tier: "MAJOR", reason: "Establishes a Belgian foothold; national capital with a real venue estate." },
  { city_id: "antwerp-be", name: "Antwerp", country: "Belgium", country_code: "BE", nominatim_countrycodes: "be", tier: "SECONDARY", reason: "Second Belgian city, distinct scene from Brussels." },
  { city_id: "dublin-ie", name: "Dublin", country: "Ireland", country_code: "IE", nominatim_countrycodes: "ie", tier: "MAJOR", reason: "Establishes an Irish foothold; dense, English-language venue estate (lower acquisition friction)." },
  { city_id: "cork-ie", name: "Cork", country: "Ireland", country_code: "IE", nominatim_countrycodes: "ie", tier: "SMALLER", reason: "Smaller Irish city, testing the underserved-secondary-market proposition." },
  { city_id: "madrid-es", name: "Madrid", country: "Spain", country_code: "ES", nominatim_countrycodes: "es", tier: "MAJOR", reason: "Major Spanish market genuinely new to this project (distinct from already-covered Barcelona)." },
  { city_id: "valencia-es", name: "Valencia", country: "Spain", country_code: "ES", nominatim_countrycodes: "es", tier: "SECONDARY", reason: "Large secondary Spanish city with its own independent scene." },
  { city_id: "bilbao-es", name: "Bilbao", country: "Spain", country_code: "ES", nominatim_countrycodes: "es", tier: "SMALLER", reason: "Basque-country city with a distinct, active live scene." },
  { city_id: "seville-es", name: "Seville", country: "Spain", country_code: "ES", nominatim_countrycodes: "es", tier: "SECONDARY", reason: "Major Andalusian city, new regional coverage within Spain." },
  { city_id: "milan-it", name: "Milan", country: "Italy", country_code: "IT", nominatim_countrycodes: "it", tier: "MAJOR", reason: "Establishes an Italian foothold; Italy's largest live-music/club market." },
  { city_id: "rome-it", name: "Rome", country: "Italy", country_code: "IT", nominatim_countrycodes: "it", tier: "MAJOR", reason: "National capital, large distinct venue estate from Milan." },
  { city_id: "bologna-it", name: "Bologna", country: "Italy", country_code: "IT", nominatim_countrycodes: "it", tier: "SMALLER", reason: "University city with a dense, historically active independent music scene." },
  { city_id: "vienna-at", name: "Vienna", country: "Austria", country_code: "AT", nominatim_countrycodes: "at", tier: "MAJOR", reason: "Establishes an Austrian foothold; major market." },
  { city_id: "prague-cz", name: "Prague", country: "Czech Republic", country_code: "CZ", nominatim_countrycodes: "cz", tier: "MAJOR", reason: "Establishes a Czech foothold; major Central European market." },
  { city_id: "zagreb-hr", name: "Zagreb", country: "Croatia", country_code: "HR", nominatim_countrycodes: "hr", tier: "MAJOR", reason: "Establishes a Croatian foothold — this project's own README already names Croatia as in-scope, but no acquisition work exists yet for any Croatian city." },
].map((c) => Object.freeze({ ...c, wave_id: WAVE_1_ID, acquisition_tier: 1, enabled: true })));

/**
 * Documents the audit this wave's selection was checked against (see
 * existing-coverage.mjs for the actual, dynamically re-derived guard —
 * this constant is not itself the enforcement mechanism).
 */
export const KNOWN_EXCLUDED_METROS = Object.freeze([
  "Berlin", "London", "Paris", "Barcelona",
  "Lisboa", "Sintra", "Cascais", "Estoril", "Oeiras", "Seixal", "Setúbal", "Amadora", "Algés", "Odivelas",
  "Porto", "Vila Nova de Gaia", "Póvoa de Varzim", "Espinho", "Maia", "Matosinhos", "Gondomar", "Vila do Conde", "Valongo",
]);

/**
 * Pure check: returns the list of Wave-1 cities that collide with the
 * given (dynamically derived, see existing-coverage.mjs)
 * already-covered-city set. Empty result means the wave is clean.
 */
export function findCoverageCollisions(waveCities, existingCoverageSet) {
  return waveCities.filter((city) => existingCoverageSet.has(city.name.trim().toLowerCase()));
}
