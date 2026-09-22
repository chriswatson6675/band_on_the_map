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

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — postcode
// extraction is country-aware: a bare `\d{5}` pattern only ever matched
// US-style ZIP codes, so every UK candidate's postcode was silently
// null, which is exactly why the reconciliation address-conflict guard
// (reconcile.mjs) could not use postcode evidence for Manchester at all.
// Each pattern extracts a real, standard national postcode format;
// countries without an explicit entry fall back to the original 5-digit
// pattern, so every existing caller's behaviour for a country already in
// use (Portugal, Spain, ...) is completely unchanged.
const POSTCODE_PATTERNS = {
  gb: /\b[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}\b/,
};
const DEFAULT_POSTCODE_PATTERN = /\b\d{5}\b/;

/**
 * The extracted postcode is normalised for comparison (whitespace
 * stripped, uppercased) so "M3 5HW", "m35hw", and "M3  5HW" — three
 * real, equally valid ways different providers format the exact same UK
 * postcode — all compare equal. This is a stable comparison KEY, not a
 * display value.
 */
export function extractPostcode(value, countryCode) {
  const pattern = POSTCODE_PATTERNS[String(countryCode ?? "").toLowerCase()] ?? DEFAULT_POSTCODE_PATTERN;
  const match = String(value ?? "").match(pattern);
  return match ? match[0].toUpperCase().replace(/\s+/g, "") : null;
}

export function normaliseCandidate(candidate) {
  return {
    ...candidate,
    normalised_name: normaliseText(candidate.reported_name),
    normalised_address: normaliseText(candidate.reported_address),
    official_domain_candidate: normaliseDomain(candidate.reported_website),
    postcode: extractPostcode(candidate.reported_address, candidate.country_code),
  };
}
