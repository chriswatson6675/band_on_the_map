// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — candidate provider reading
// this repository's own retained venue-estate research
// (research/venue-estate/*.json — e.g. london-venue-estate-01.json,
// lisbon-porto-venue-estate-01.json). Read-only reshaping into this
// controller's common Candidate shape; no new research performed.
//
// Field-name drift is real across these files (London uses
// official_programme_url, Lisbon/Porto uses official_events_url) — this
// provider normalises both into the same `programme_url` field rather than
// assuming one name universally.

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VENUE_ESTATE_DIR = "research/venue-estate";

const PROGRAMME_URL_FIELDS = ["official_programme_url", "official_events_url"];

// These research files use the literal string "UNKNOWN" (not null) as a
// sentinel for an unresolved field — e.g. london-venue-estate-01.json's
// own `latitude`/`longitude` do the same. A naive non-empty-string check
// would treat it as a real URL and hand acquireSource() the literal
// string "UNKNOWN" to fetch, misclassifying a plain data-quality gap as
// NETWORK_FAILURE (confirmed: exactly the 109 London entries carrying
// this sentinel matched a real dry run's entire T1_DEFER_NETWORK count).
function isRealUrlValue(value) {
  return typeof value === "string" && value.trim() !== "" && value.trim().toUpperCase() !== "UNKNOWN";
}

function selectProgrammeUrl(entry) {
  for (const field of PROGRAMME_URL_FIELDS) {
    if (isRealUrlValue(entry?.[field])) return entry[field];
  }
  return null;
}

function deriveCandidateName(entry) {
  return entry?.venue_name ?? entry?.canonical_name_candidate ?? null;
}

/** Match an entry (or the file's own top-level region) against the known, closed city estate — never invents a new city. */
function deriveCityForEntry(entry, topLevelRegion, knownCities) {
  const label = String(entry?.city ?? topLevelRegion ?? "").toLowerCase().trim();
  if (!label) return null;
  return (
    knownCities.find((c) => String(c.display_name ?? "").toLowerCase() === label) ??
    knownCities.find((c) => label.includes(String(c.display_name ?? "").toLowerCase()) && c.display_name) ??
    null
  );
}

/** Already resolved to an existing canonical venue, or explicitly admitted by a prior package — not a new Tier-1 candidate. */
function alreadyResolved(entry) {
  return (
    entry?.classification === "EXISTING_CANONICAL" ||
    entry?.admitted_this_package === true ||
    (typeof entry?.existing_canonical_venue_id === "string" && entry.existing_canonical_venue_id.trim() !== "")
  );
}

export async function loadVenueEstateCandidates({ root = ROOT, knownCities } = {}) {
  const dir = resolve(root, VENUE_ESTATE_DIR);
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const candidates = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(resolve(dir, file), "utf8"));
    } catch {
      continue;
    }
    const venues = Array.isArray(parsed?.venues) ? parsed.venues : null;
    if (!venues) continue; // an audit artifact (e.g. automation-status, event-evidence files), not a venue list

    venues.forEach((entry, index) => {
      if (alreadyResolved(entry)) return;
      const canonicalName = deriveCandidateName(entry);
      const website = isRealUrlValue(entry?.official_website) ? entry.official_website : null;
      if (!canonicalName || !website) return; // no usable identity/source signal at all — not this provider's job to invent one

      const city = deriveCityForEntry(entry, parsed.region, knownCities);
      const address =
        typeof entry?.address_text_from_evidence === "string" &&
        entry.address_text_from_evidence.trim() !== "" &&
        entry.address_text_from_evidence !== "UNKNOWN"
          ? entry.address_text_from_evidence
          : null;
      candidates.push({
        canonical_name: canonicalName,
        city: city?.display_name ?? null,
        city_key: city?.city_key ?? null,
        country_code: city?.country_code ?? null,
        website,
        programme_url: selectProgrammeUrl(entry),
        address,
        acquisition_class: null, // not pre-classified by an investigation — proceed straight to acquireSource()
        identity_clear: city != null,
        provenance: {
          kind: "VENUE_ESTATE",
          file: `${VENUE_ESTATE_DIR}/${file}`,
          index,
        },
      });
    });
  }
  return candidates;
}

export { ROOT as VENUE_ESTATE_PROVIDER_ROOT };
