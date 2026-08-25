// VENUE-DISCOVERY-ENGINE-01 — Barcelona Open Data ("Espais de música i
// copes") response parsing.
//
// Turns the raw CKAN JSON array (client.mjs's `body`) into "raw lead"
// records, preserving every category tag as evidence. Never invents a
// missing address/coordinate/website — see PHASE 3's "do not invent
// missing values" — and never classifies (category-rules.mjs does
// that).

function firstAddress(record) {
  return Array.isArray(record?.addresses) && record.addresses.length > 0 ? record.addresses[0] : null;
}

function buildAddressText(address) {
  if (!address) return null;
  const parts = [];
  if (typeof address.address_name === "string" && address.address_name.trim() !== "") {
    const streetNumber =
      typeof address.street_number_1 === "string" || typeof address.street_number_1 === "number"
        ? String(address.street_number_1)
        : null;
    parts.push(streetNumber ? `${address.address_name.trim()}, ${streetNumber}` : address.address_name.trim());
  }
  if (typeof address.zip_code === "string" && address.zip_code.trim() !== "") parts.push(address.zip_code.trim());
  if (typeof address.town === "string" && address.town.trim() !== "") parts.push(address.town.trim());
  return parts.length > 0 ? parts.join(", ") : null;
}

function coordinatesFor(record) {
  const point = record?.geo_epgs_4326_latlon;
  if (point && typeof point.lat === "number" && typeof point.lon === "number") {
    return { latitude: point.lat, longitude: point.lon };
  }
  return { latitude: null, longitude: null };
}

function findWebsite(record) {
  for (const category of record?.attribute_categories ?? []) {
    for (const attribute of category?.attributes ?? []) {
      if (attribute?.attribute_name === "Web") {
        const value = (attribute.values ?? []).find((v) => typeof v?.url_value === "string" && v.url_value.trim() !== "");
        if (value) return value.url_value.trim();
      }
    }
  }
  return null;
}

function categoryNames(record) {
  return (record?.secondary_filters_data ?? [])
    .map((f) => (typeof f?.name === "string" ? f.name : null))
    .filter((name) => typeof name === "string" && name.trim() !== "");
}

/**
 * Parse the raw CKAN JSON body into raw leads:
 *   { source_record_id, name, latitude, longitude, address, website_url, categories }
 *
 * Throws on a structurally malformed body (not a JSON array). An empty
 * array is a legitimate "nothing published" result and returns `[]`.
 */
export function parseBarcelonaOpenData(body) {
  if (!Array.isArray(body)) {
    throw new Error("Malformed Barcelona Open Data response: expected a JSON array of records");
  }

  const leads = [];
  for (const record of body) {
    if (!record || typeof record !== "object" || record.register_id === undefined) {
      continue; // not a real record — skip rather than guess an identity
    }
    const address = firstAddress(record);
    const { latitude, longitude } = coordinatesFor(record);

    leads.push({
      source_record_id: String(record.register_id),
      name: typeof record.name === "string" && record.name.trim() !== "" ? record.name.trim() : null,
      latitude,
      longitude,
      address: buildAddressText(address),
      website_url: findWebsite(record),
      categories: categoryNames(record),
    });
  }
  return leads;
}
