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

export function extractPostcode(value) {
  return String(value ?? "").match(/\b\d{5}\b/)?.[0] ?? null;
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
