import { extractPostcode, normaliseDomain, normaliseText } from "./normalise.mjs";

function matchGroup(group, records) {
  const names = new Set(group.reported_names.map(normaliseText));
  const addresses = new Set(group.reported_addresses.map(normaliseText).filter(Boolean));
  const postcodes = new Set(group.reported_addresses.map(extractPostcode).filter(Boolean));
  const domains = new Set(group.reported_websites.map(normaliseDomain).filter(Boolean));
  const strong = [];
  const possible = [];
  for (const record of records) {
    const name = normaliseText(record.name);
    const address = normaliseText(record.address);
    const domain = normaliseDomain(record.website);
    const postcode = extractPostcode(record.address);
    const nameMatch = names.has(name);
    if ((domain && domains.has(domain)) || (nameMatch && address && addresses.has(address)) || (nameMatch && postcode && postcodes.has(postcode))) strong.push(record);
    else if (nameMatch) possible.push(record);
  }
  return { strong, possible };
}

export function buildRegistryRecords(sourceRegistry, venueRegistry) {
  const venues = (venueRegistry?.venues ?? []).map((venue) => ({
    kind: "VENUE", id: venue.venue_id, name: venue.canonical_name, address: venue.address, website: null, active: false,
  }));
  const sources = (sourceRegistry?.entries ?? []).map((source) => ({
    kind: "SOURCE", id: source.id, name: source.name, address: source.physical_address,
    website: source.official_website, active: source.active_status === "ACTIVE" || source.lifecycle_status === "ACTIVE",
    lifecycle_status: source.lifecycle_status,
  }));
  return [...sources, ...venues];
}

export function reconcileWithExistingRegistry(groups, sourceRegistry, venueRegistry) {
  const records = buildRegistryRecords(sourceRegistry, venueRegistry);
  return groups.map((group) => {
    const { strong, possible } = matchGroup(group, records);
    const source = strong.find((item) => item.kind === "SOURCE");
    const venue = strong.find((item) => item.kind === "VENUE");
    let existing_status = "NEW_DISCOVERY_CANDIDATE";
    if (source?.active) existing_status = "ALREADY_ACQUIRED";
    else if (source) existing_status = "KNOWN_SOURCE_NOT_ACTIVE";
    else if (venue) existing_status = "KNOWN_VENUE_NO_SOURCE";
    else if (possible.length) existing_status = "POSSIBLE_EXISTING_MATCH_REVIEW";
    return {
      ...group,
      coverage: { ...group.coverage, already_known_to_beatmapped: Boolean(source || venue) },
      existing_registry_reconciliation: {
        status: existing_status,
        confident_matches: strong.map(({ kind, id }) => ({ kind, id })),
        possible_matches: possible.map(({ kind, id }) => ({ kind, id })),
      },
    };
  });
}
