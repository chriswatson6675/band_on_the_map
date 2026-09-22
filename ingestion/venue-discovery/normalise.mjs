export function normaliseText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(strasse|straße|str\.)\b/g, "str")
    .replace(/\b(venue|club|theater|theatre)\b/g, (match) => match)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normaliseDomain(value) {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

// BEATMAPPED-UK-NATIONAL-LIVE-VENUE-DISCOVERY-EXPANSION-01: UK postcodes
// (e.g. "SW1A 1AA", "M1 1AE") never match the German 5-digit pattern below
// — tried first, since it's the more specific/less ambiguous shape and a
// UK-format string could theoretically also contain 5 consecutive digits
// elsewhere in a longer address that the DE pattern would wrongly grab.
// Every existing German (Berlin) caller keeps its exact prior behaviour:
// a DE address has no UK-shaped substring, so the UK branch never matches
// there and normal 5-digit matching is completely unchanged.
const UK_POSTCODE_PATTERN = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/i;
const DE_POSTCODE_PATTERN = /\b\d{5}\b/;

export function extractPostcode(value) {
  const text = String(value ?? "");
  const uk = text.match(UK_POSTCODE_PATTERN)?.[0];
  if (uk) return uk.toUpperCase().replace(/\s+/g, " ").trim();
  return text.match(DE_POSTCODE_PATTERN)?.[0] ?? null;
}

export function normaliseCandidate(candidate) {
  return {
    ...candidate,
    normalised_name: normaliseText(candidate.reported_name),
    normalised_address: normaliseText(candidate.reported_address),
    official_domain_candidate: normaliseDomain(candidate.reported_website),
    postcode: extractPostcode(candidate.reported_address),
  };
}
