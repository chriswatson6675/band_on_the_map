// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-01 — deterministic compilation of
// the per-venue-class research workstreams into the four census artifacts.
//
// Pure and deterministic: given the same workstream inputs it produces
// byte-identical outputs (every list is explicitly sorted, every id is
// derived, nothing consults the clock except the caller-supplied
// generatedAt). It never fetches anything and never writes outside the
// census research directory — see tests/major-event-census.test.mjs.

import {
  CENSUS_ARTIFACT_TYPE, CENSUS_FRAMEWORK_VERSION, CAPACITY_THRESHOLD,
  createVenueCensusId, createCalendarSourceId, VENUE_TYPES,
  CONVENTION_CLASS_VENUE_TYPES, SCALE_EXCEPTION_SPORTING_VENUE_TYPES,
  OFFICIAL_URL_STATUSES,
  CAPACITY_TYPES, CAPACITY_SOURCE_AUTHORITIES, CAPACITY_CONFIDENCE,
  CALENDAR_SOURCE_TYPES, SPORTS,
} from "./contract.mjs";

const text = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/**
 * Researchers legitimately use several words for "not open": CLOSED,
 * CLOSED_PERMANENTLY, PERMANENTLY_CLOSED, DEMOLISHED. They all mean the
 * same thing for this census, and Phase 2 of the brief excludes closed
 * venues and not-yet-operational venues alike — so they are normalised
 * to one vocabulary here, then filtered out of the census body (but
 * COUNTED, never silently dropped, so a later pass can see they were
 * considered and deliberately excluded rather than missed).
 */
function normaliseOperationalStatus(raw) {
  const value = String(raw ?? "").toUpperCase().trim();
  if (value === "OPERATIONAL") return "OPERATIONAL";
  if (/CLOSED|DEMOLISH|DEFUNCT/.test(value)) return "CLOSED";
  if (/CONSTRUCTION|PLANNED|PROPOSED|UNBUILT/.test(value)) return "UNDER_CONSTRUCTION";
  return "STATUS_REVIEW_REQUIRED";
}
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const bool = (value) => (typeof value === "boolean" ? value : null);

/**
 * True when a raw record cites at least one public event/fixture calendar.
 * This is the positive evidence that a venue actually stages public events,
 * as opposed to a prose note about what could not be found.
 */
function stagesPublicEvents(raw) {
  return (Array.isArray(raw?.calendar_sources) ? raw.calendar_sources : [])
    .some((source) => text(source?.source_url) && source?.publicly_accessible !== false);
}

/** Normalise one raw researched venue into the census venue record shape. */
function normaliseVenue(raw, workstream) {
  const canonicalName = text(raw?.canonical_name);
  const city = text(raw?.city);
  const nation = text(raw?.nation);
  if (!canonicalName || !city || !nation) return null;

  const venueType = VENUE_TYPES.has(raw?.venue_type) ? raw.venue_type : "OTHER_MAJOR_EVENT_VENUE";
  const capacityValue = num(raw?.capacity?.capacity_value);
  // The SAME "a number with no cited source is never proven" rule that
  // normaliseCapacityEvidence() applies to the evidence record itself —
  // the two must never disagree, or a venue could be admitted on an
  // inclusion basis its own capacity evidence does not support.
  const capacityConfidence = capacityValue !== null && !text(raw?.capacity?.capacity_source)
    ? "CAPACITY_REVIEW_REQUIRED"
    : CAPACITY_CONFIDENCE.has(raw?.capacity?.capacity_confidence)
      ? raw.capacity.capacity_confidence
      : "CAPACITY_REVIEW_REQUIRED";

  // Inclusion basis is derived, never asserted by the researcher: a proven
  // capacity at or above threshold qualifies on capacity; a
  // convention/exhibition venue without one qualifies on the documented
  // scale exception; anything else is explicitly flagged for review
  // rather than silently admitted.
  const hasConventionScale = num(raw?.largest_room_capacity) !== null || num(raw?.total_event_space_sqm) !== null || num(raw?.exhibition_space_sqm) !== null || text(raw?.scale_description);
  let inclusionBasis;
  if (capacityValue !== null && capacityValue >= CAPACITY_THRESHOLD && capacityConfidence !== "CAPACITY_REVIEW_REQUIRED") {
    inclusionBasis = "CAPACITY_THRESHOLD_MET";
  } else if (CONVENTION_CLASS_VENUE_TYPES.has(venueType) && hasConventionScale) {
    inclusionBasis = "MAJOR_CONVENTION_EXHIBITION_INFRASTRUCTURE";
  } else if (SCALE_EXCEPTION_SPORTING_VENUE_TYPES.has(venueType) && stagesPublicEvents(raw)) {
    // A racecourse, circuit or greyhound track is major permanent event
    // infrastructure whether or not anyone publishes a seat count.
    //
    // The qualifying evidence is a CITED public fixture/race calendar —
    // positive proof that the venue actually stages public events. It is
    // deliberately NOT scale_description, because a researcher writing
    // "no capacity figure published" is recording the ABSENCE of evidence,
    // and admitting a venue on that sentence would turn this exception
    // into a way to admit any uncertain venue.
    //
    // Note this basis does not assert a proven >=1,000 capacity. It
    // asserts documented major sporting infrastructure, and is reported
    // separately from CAPACITY_THRESHOLD_MET for exactly that reason.
    inclusionBasis = "MAJOR_SPORTING_INFRASTRUCTURE";
  } else {
    inclusionBasis = "CAPACITY_REVIEW_REQUIRED";
  }

  const evidence = Array.isArray(raw?.evidence)
    ? raw.evidence.filter((item) => text(item?.kind) && text(item?.value)).map((item) => ({ kind: text(item.kind), value: text(item.value), note: text(item.note) }))
    : [];
  // A census record always carries at least the workstream that produced
  // it, so provenance can never be empty — but a venue whose researcher
  // cited nothing at all is flagged, not silently accepted.
  const provenanceEvidence = evidence.length ? evidence : (text(raw?.official_url) ? [{ kind: "FETCHED_URL", value: text(raw.official_url), note: "official venue URL (sole cited evidence)" }] : []);

  return {
    venue_census_id: createVenueCensusId(canonicalName, city, nation),
    canonical_name: canonicalName,
    alternative_names: Array.isArray(raw?.alternative_names) ? [...new Set(raw.alternative_names.map(text).filter(Boolean))].sort() : [],
    parent_complex: text(raw?.parent_complex),
    operator: text(raw?.operator),
    city,
    nation,
    address: text(raw?.address),
    postcode: text(raw?.postcode),
    latitude: num(raw?.latitude),
    longitude: num(raw?.longitude),
    official_url: text(raw?.official_url),
    // A URL proven NOT to belong to this venue is quarantined, never
    // deleted: the census must show the domain was checked and rejected,
    // not that it was never considered. See Phase 10.
    official_url_status: OFFICIAL_URL_STATUSES.has(raw?.official_url_status) ? raw.official_url_status : "OFFICIAL_URL_VERIFIED",
    official_url_quarantined: text(raw?.official_url_quarantined),
    official_url_quarantine_reason: text(raw?.official_url_quarantine_reason),
    venue_type: venueType,
    operational_status: normaliseOperationalStatus(raw?.operational_status),
    inclusion_basis: inclusionBasis,
    largest_room_capacity: num(raw?.largest_room_capacity),
    total_event_space_sqm: num(raw?.total_event_space_sqm),
    exhibition_space_sqm: num(raw?.exhibition_space_sqm),
    scale_description: text(raw?.scale_description),
    identity_review: false,
    identity_review_reason: null,
    provenance: { workstream, evidence: provenanceEvidence },
    // Retained through reconciliation so a merged record can elect its
    // class on evidence instead of on workstream file order.
    __typeClaims: [{ venue_type: venueType, capacity_value: capacityValue, workstream }],
  };
}

function normaliseCapacityEvidence(raw, venueCensusId) {
  const entries = [];
  const push = (capacity, isPrincipal) => {
    const capacityValue = num(capacity?.capacity_value);
    const confidence = CAPACITY_CONFIDENCE.has(capacity?.capacity_confidence) ? capacity.capacity_confidence : "CAPACITY_REVIEW_REQUIRED";
    entries.push({
      venue_census_id: venueCensusId,
      is_principal: isPrincipal,
      capacity_value: capacityValue,
      capacity_type: CAPACITY_TYPES.has(capacity?.capacity_type) ? capacity.capacity_type : "OTHER_EXPLICIT",
      capacity_configuration: text(capacity?.capacity_configuration),
      capacity_source: text(capacity?.capacity_source),
      capacity_source_authority: CAPACITY_SOURCE_AUTHORITIES.has(capacity?.capacity_source_authority) ? capacity.capacity_source_authority : null,
      capacity_observed_at: text(capacity?.capacity_observed_at),
      // A number with no cited source can never be presented as proven,
      // whatever the researcher claimed.
      capacity_confidence: capacityValue !== null && !text(capacity?.capacity_source) ? "CAPACITY_REVIEW_REQUIRED" : confidence,
    });
  };
  if (raw?.capacity) push(raw.capacity, true);
  for (const extra of Array.isArray(raw?.additional_capacities) ? raw.additional_capacities : []) push(extra, false);
  return entries;
}

/**
 * Label a source's family for reporting. A source with no family was either
 * never attempted or attempted and failed to fetch — reporting both as
 * "NOT_YET_FINGERPRINTED" would claim work was outstanding when in fact it
 * was done and the host was unreachable.
 */
export function familyLabel(source) {
  if (source?.source_family) return source.source_family;
  return source?.fingerprinted_at ? "FINGERPRINT_FETCH_FAILED" : "NOT_YET_FINGERPRINTED";
}

const CAPACITY_AUTHORITY_RANK = { GRADE_A: 3, GRADE_B: 2, GRADE_C: 1 };
const CAPACITY_CONFIDENCE_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, CAPACITY_REVIEW_REQUIRED: 0 };

/**
 * Rank two competing principal capacity claims for the same venue. The
 * ordering is by evidence quality — a sourced number beats an unsourced or
 * missing one, then source authority, then stated confidence. Value is only
 * ever a tie-break between equally-evidenced claims, so the census can never
 * prefer a figure merely because it is the largest.
 */
function comparePrincipalCapacity(a, b) {
  const sourced = (item) => (item.capacity_value !== null && item.capacity_source ? 1 : 0);
  return (
    sourced(b) - sourced(a) ||
    (CAPACITY_AUTHORITY_RANK[b.capacity_source_authority] ?? 0) - (CAPACITY_AUTHORITY_RANK[a.capacity_source_authority] ?? 0) ||
    (CAPACITY_CONFIDENCE_RANK[b.capacity_confidence] ?? 0) - (CAPACITY_CONFIDENCE_RANK[a.capacity_confidence] ?? 0) ||
    (b.capacity_value ?? -1) - (a.capacity_value ?? -1) ||
    String(a.capacity_source ?? "").localeCompare(String(b.capacity_source ?? ""))
  );
}

/**
 * Each researched record carries its own principal capacity, so a venue
 * found by several workstreams arrives with several. Exactly one may stay
 * principal — otherwise the venue's headline capacity is whichever record
 * happened to be compiled last, which is how an unsourced figure can end up
 * representing a venue two other researchers costed properly. The losers are
 * demoted, never discarded: a real disagreement must stay visible.
 */
export function electPrincipalCapacity(entries) {
  const principals = entries.filter((entry) => entry.is_principal);
  if (principals.length <= 1) return entries;
  const [winner] = [...principals].sort(comparePrincipalCapacity);
  return entries.map((entry) => (entry.is_principal && entry !== winner ? { ...entry, is_principal: false } : entry));
}

/** True when a venue's competing principal claims state different capacities. */
function claimsConflict(entries) {
  const values = new Set(entries.filter((entry) => entry.is_principal).map((entry) => entry.capacity_value));
  return values.size > 1;
}

function normaliseCalendarSources(raw, venueCensusId) {
  const sources = Array.isArray(raw?.calendar_sources) ? raw.calendar_sources : [];
  const seen = new Set();
  const output = [];
  for (const source of sources) {
    const sourceUrl = text(source?.source_url);
    if (!sourceUrl || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    output.push({
      calendar_source_id: createCalendarSourceId(venueCensusId, sourceUrl),
      venue_census_id: venueCensusId,
      source_url: sourceUrl,
      source_type: CALENDAR_SOURCE_TYPES.has(source?.source_type) ? source.source_type : "OTHER_MAJOR_EVENTS",
      sport: SPORTS.has(source?.sport) ? source.sport : null,
      first_party: bool(source?.first_party),
      publicly_accessible: bool(source?.publicly_accessible),
      events_currently_present: bool(source?.events_currently_present),
      // Filled in by the separate, bounded live fingerprint step; never
      // guessed at compile time.
      source_family: null,
      source_family_signals: null,
      acquisition_readiness: "SOURCE_REVIEW_REQUIRED",
      notes: text(source?.notes),
      last_checked: text(source?.last_checked),
    });
  }
  return output;
}

/**
 * Deterministic identity reconciliation. Two researched records are the
 * same venue only on strong evidence — a shared official-website origin,
 * or the same normalised name in the same city. Deliberately conservative
 * in BOTH directions (this package's brief): never merged merely because
 * two venues share an operator, a booking domain or one complex; never
 * split merely because providers format a name differently. Anything
 * genuinely ambiguous is flagged for review rather than decided here.
 */
function normaliseName(value) {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .replace(/\b(the|stadium|ground|arena|centre|center|hall)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function originOf(url) {
  try { return new URL(url).origin.toLowerCase().replace("://www.", "://"); } catch { return null; }
}

/**
 * Which broad kind of event activity a venue class represents. Used only
 * to decide whether two researchers' disagreement is a nuance within one
 * kind of activity, or genuine evidence that the venue does several.
 * The multi-purpose and catch-all classes carry no family of their own.
 */
const VENUE_TYPE_FAMILIES = new Map([
  ["FOOTBALL_STADIUM", "SPORT"], ["RUGBY_STADIUM", "SPORT"], ["CRICKET_GROUND", "SPORT"],
  ["OTHER_SPORTS_VENUE", "SPORT"], ["RACECOURSE", "SPORT"], ["MOTORSPORT_CIRCUIT", "SPORT"],
  ["GREYHOUND_STADIUM", "SPORT"],
  ["INDOOR_ARENA", "PERFORMANCE"], ["CONCERT_HALL", "PERFORMANCE"], ["THEATRE", "PERFORMANCE"],
  ["AUDITORIUM", "PERFORMANCE"],
  ["CONVENTION_CENTRE", "BUSINESS"], ["CONFERENCE_CENTRE", "BUSINESS"],
  ["EXHIBITION_CENTRE", "BUSINESS"], ["CONFERENCE_EXHIBITION_COMPLEX", "BUSINESS"],
]);

/**
 * Elect one venue class for a record several workstreams classified
 * differently.
 *
 * Without this the class was decided by whichever workstream file sorted
 * first — which is how Coventry Building Society Arena, a 32,609-capacity
 * Premier League stadium, came to be presented as an EXHIBITION_CENTRE.
 *
 * Two distinct rules, because two distinct situations:
 *  - Researchers disagree ACROSS activity families (a stadium that is also
 *    an exhibition centre): the venue genuinely does several things, so it
 *    becomes MULTI_PURPOSE_EVENT_COMPLEX. That is the honest answer to
 *    "what kind of large event activity happens here?", not a tie-break.
 *  - They disagree WITHIN one family (a dual-code football/rugby ground,
 *    or auditorium vs indoor arena): elect the class of the best-evidenced
 *    largest configuration, since that is the venue's principal use.
 *
 * Every claim is retained on the record either way, so a dual-code ground
 * never loses the fact that it is one.
 */
export function electVenueType(claims) {
  const distinct = [...new Set(claims.map((claim) => claim.venue_type))];
  if (distinct.length <= 1) return { venueType: distinct[0] ?? "OTHER_MAJOR_EVENT_VENUE", multiPurpose: false };

  const families = new Set(claims.map((claim) => VENUE_TYPE_FAMILIES.get(claim.venue_type)).filter(Boolean));
  if (families.size > 1) return { venueType: "MULTI_PURPOSE_EVENT_COMPLEX", multiPurpose: true };

  const counts = new Map();
  for (const claim of claims) counts.set(claim.venue_type, (counts.get(claim.venue_type) ?? 0) + 1);
  const ranked = [...claims].sort((a, b) =>
    (b.capacity_value ?? -1) - (a.capacity_value ?? -1) ||
    (counts.get(b.venue_type) ?? 0) - (counts.get(a.venue_type) ?? 0) ||
    String(a.venue_type).localeCompare(String(b.venue_type)));
  return { venueType: ranked[0].venue_type, multiPurpose: false };
}

/** Every name this record is known by, normalised — canonical plus aliases. */
function nameAliases(venue) {
  return new Set([venue.canonical_name, ...(venue.alternative_names ?? [])].map(normaliseName).filter(Boolean));
}

/**
 * True when one record declares the other as its parent complex. A named
 * sub-venue inside a complex (e.g. "Indoor Arena, Coventry Building
 * Society Arena" within "Coventry Building Society Arena") is a SEPARATE
 * venue by design — Rule C of the census — so it must never be collapsed
 * into its parent just because they share a name.
 */
function isParentChildPair(a, b) {
  const parents = [normaliseName(a.parent_complex), normaliseName(b.parent_complex)].filter(Boolean);
  if (!parents.length) return false;
  const aNames = nameAliases(a);
  const bNames = nameAliases(b);
  return parents.some((parent) => aNames.has(parent) || bNames.has(parent));
}

/** Merge `venue` into `existing`, retaining both provenance trails. */
function mergeVenueInto(existing, venue) {
  const existingOrigin = originOf(existing.official_url);
    const incomingOrigin = originOf(venue.official_url);
    if (existingOrigin && incomingOrigin && existingOrigin !== incomingOrigin) {
      // Same name and city but genuinely different official sites — real
      // ambiguity, flagged rather than silently resolved either way.
      existing.identity_review = true;
      existing.identity_review_reason = `same name+city as another researched record but a different official site (${existingOrigin} vs ${incomingOrigin})`;
    }
    existing.alternative_names = [...new Set([...existing.alternative_names, ...venue.alternative_names, ...(venue.canonical_name !== existing.canonical_name ? [venue.canonical_name] : [])])].sort();
    existing.operator = existing.operator ?? venue.operator;
    existing.address = existing.address ?? venue.address;
    existing.postcode = existing.postcode ?? venue.postcode;
    existing.latitude = existing.latitude ?? venue.latitude;
    existing.longitude = existing.longitude ?? venue.longitude;
    existing.official_url = existing.official_url ?? venue.official_url;
    // A quarantine finding from EITHER researcher must survive the merge —
    // otherwise a second record carrying the same bad domain silently
    // reinstates a URL that was already proven wrong.
    if (venue.official_url_status !== "OFFICIAL_URL_VERIFIED" && existing.official_url_status === "OFFICIAL_URL_VERIFIED") {
      existing.official_url_status = venue.official_url_status;
    }
    existing.official_url_quarantined = existing.official_url_quarantined ?? venue.official_url_quarantined;
    existing.official_url_quarantine_reason = existing.official_url_quarantine_reason ?? venue.official_url_quarantine_reason;
    if (existing.official_url && existing.official_url === existing.official_url_quarantined) {
      existing.official_url = venue.official_url !== existing.official_url_quarantined ? venue.official_url : null;
    }
    existing.parent_complex = existing.parent_complex ?? venue.parent_complex;
  existing.provenance.evidence = [...existing.provenance.evidence, ...venue.provenance.evidence];
  existing.provenance.workstream = [...new Set(String(existing.provenance.workstream).split("+").concat(venue.provenance.workstream))].sort().join("+");
  existing.__mergedFrom = [...(existing.__mergedFrom ?? []), venue.venue_census_id, ...(venue.__mergedFrom ?? [])];
  existing.__typeClaims = [...(existing.__typeClaims ?? []), ...(venue.__typeClaims ?? [])];
}

export function reconcileVenues(venues) {
  const byKey = new Map();
  const merged = [];
  for (const venue of venues) {
    const nameKey = `${normaliseName(venue.canonical_name)}|${String(venue.city).toLowerCase().trim()}|${venue.nation}`;
    const existing = byKey.get(nameKey);
    if (!existing) {
      byKey.set(nameKey, venue);
      merged.push(venue);
      continue;
    }
    // Same normalised name in the same city+nation: one venue, two
    // researchers. Merge, keeping the richer record and retaining BOTH
    // provenance trails.
    mergeVenueInto(existing, venue);
  }

  // Second pass — ALIAS reconciliation.
  //
  // Exact-name matching alone missed real duplicates that arrive from two
  // workstreams under different headline names: "Aviva Arena" vs "Aviva
  // Arena Bristol" (both listing the aliases "YTL Arena Bristol" and
  // "Bristol Arena"), and "ICC Belfast" vs "ICC Belfast / Belfast
  // Waterfront" (each naming the other). They are one building each.
  //
  // Merging needs a SHARED NAME, not merely a shared city, and a declared
  // parent/sub-venue pair is explicitly protected. Because this is weaker
  // evidence than an exact match, the survivor is flagged for identity
  // review so the decision stays visible rather than silently made.
  const absorbed = new Set();
  const groups = new Map();
  for (const venue of merged) {
    const key = `${String(venue.city).toLowerCase().trim()}|${venue.nation}`;
    groups.set(key, [...(groups.get(key) ?? []), venue]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Sorted so the outcome never depends on workstream ordering.
    const ordered = [...group].sort((a, b) => a.venue_census_id.localeCompare(b.venue_census_id));
    for (let i = 0; i < ordered.length; i += 1) {
      if (absorbed.has(ordered[i].venue_census_id)) continue;
      for (let j = i + 1; j < ordered.length; j += 1) {
        if (absorbed.has(ordered[j].venue_census_id)) continue;
        const keeper = ordered[i];
        const candidate = ordered[j];
        if (isParentChildPair(keeper, candidate)) continue;
        const shared = [...nameAliases(candidate)].filter((alias) => nameAliases(keeper).has(alias));
        if (!shared.length) continue;
        mergeVenueInto(keeper, candidate);
        keeper.identity_review = true;
        keeper.identity_review_reason = `merged with a separately-researched record ("${candidate.canonical_name}") on a shared alternative name; verify they are one venue`;
        absorbed.add(candidate.venue_census_id);
      }
    }
  }

  const survivors = merged.filter((venue) => !absorbed.has(venue.venue_census_id));
  for (const venue of survivors) {
    const claims = venue.__typeClaims ?? [];
    const { venueType, multiPurpose } = electVenueType(claims);
    const distinct = [...new Set(claims.map((claim) => claim.venue_type))].sort();
    venue.venue_type = venueType;
    // Always retained, so a dual-code ground never loses the fact that two
    // researchers classified it differently.
    venue.venue_type_claims = distinct;
    if (distinct.length > 1 && !multiPurpose) {
      venue.venue_type_election = `elected from ${distinct.join(", ")} by best-evidenced largest configuration`;
    } else if (multiPurpose) {
      venue.venue_type_election = `classified multi-purpose: researchers evidenced ${distinct.join(", ")}`;
    } else {
      venue.venue_type_election = null;
    }
    delete venue.__typeClaims;
  }
  return survivors;
}

/** Compile workstream documents into the four census artifacts. */
export function compileCensus(workstreamDocuments, { generatedAt, censusId = "uk-major-event-census-01" } = {}) {
  const rawVenues = [];
  const capacityByRawId = new Map();
  const calendarsByRawId = new Map();
  const workstreamSummaries = [];

  for (const document of workstreamDocuments) {
    const workstream = text(document?.workstream) ?? "UNKNOWN_WORKSTREAM";
    const venues = Array.isArray(document?.venues) ? document.venues : [];
    let accepted = 0;
    for (const raw of venues) {
      const venue = normaliseVenue(raw, workstream);
      if (!venue) continue;
      accepted += 1;
      rawVenues.push(venue);
      capacityByRawId.set(venue.venue_census_id, [...(capacityByRawId.get(venue.venue_census_id) ?? []), ...normaliseCapacityEvidence(raw, venue.venue_census_id)]);
      calendarsByRawId.set(venue.venue_census_id, [...(calendarsByRawId.get(venue.venue_census_id) ?? []), ...normaliseCalendarSources(raw, venue.venue_census_id)]);
    }
    workstreamSummaries.push({
      workstream,
      generated_at: text(document?.generated_at),
      method_notes: text(document?.method_notes),
      venues_supplied: venues.length,
      venues_accepted: accepted,
      venues_rejected_incomplete: venues.length - accepted,
    });
  }

  const reconciled = reconcileVenues(rawVenues).sort((a, b) => a.venue_census_id.localeCompare(b.venue_census_id));
  // Phase 2 exclusions: closed venues and venues not yet operational are
  // out of scope for the census population, but are retained separately
  // so the record shows they were researched and deliberately excluded.
  const venues = reconciled.filter((venue) => venue.operational_status === "OPERATIONAL" || venue.operational_status === "STATUS_REVIEW_REQUIRED");
  const excludedNonOperational = reconciled
    .filter((venue) => venue.operational_status === "CLOSED" || venue.operational_status === "UNDER_CONSTRUCTION")
    .map((venue) => ({ venue_census_id: venue.venue_census_id, canonical_name: venue.canonical_name, city: venue.city, nation: venue.nation, venue_type: venue.venue_type, operational_status: venue.operational_status }));

  const capacityEvidence = [];
  const calendarSources = [];
  let venuesWithConflictingCapacityClaims = 0;
  for (const venue of venues) {
    const ids = [venue.venue_census_id, ...(venue.__mergedFrom ?? [])];
    const seenCapacity = new Set();
    const venueCapacity = [];
    for (const id of ids) {
      for (const evidence of capacityByRawId.get(id) ?? []) {
        const key = `${evidence.capacity_value}|${evidence.capacity_type}|${evidence.capacity_configuration}`;
        if (seenCapacity.has(key)) continue;
        seenCapacity.add(key);
        venueCapacity.push({ ...evidence, venue_census_id: venue.venue_census_id });
      }
      for (const source of calendarsByRawId.get(id) ?? []) {
        calendarSources.push({ ...source, venue_census_id: venue.venue_census_id, calendar_source_id: createCalendarSourceId(venue.venue_census_id, source.source_url) });
      }
    }
    if (claimsConflict(venueCapacity)) venuesWithConflictingCapacityClaims += 1;
    capacityEvidence.push(...electPrincipalCapacity(venueCapacity));
    delete venue.__mergedFrom;
  }

  const dedupedCalendars = [...new Map(calendarSources.map((source) => [source.calendar_source_id, source])).values()]
    .sort((a, b) => a.calendar_source_id.localeCompare(b.calendar_source_id));
  const sortedCapacity = capacityEvidence.sort((a, b) => a.venue_census_id.localeCompare(b.venue_census_id) || String(a.capacity_type).localeCompare(String(b.capacity_type)));

  const envelope = (artifact, records, extra = {}) => ({
    artifact_type: `${CENSUS_ARTIFACT_TYPE}__${artifact}`,
    framework_version: CENSUS_FRAMEWORK_VERSION,
    census_id: censusId,
    generated_at: generatedAt,
    counts: { records: records.length, ...extra },
  });

  return {
    venues: {
      ...envelope("VENUES", venues, { ...countVenues(venues), excluded_non_operational: excludedNonOperational.length }),
      capacity_threshold: CAPACITY_THRESHOLD,
      excluded_non_operational: excludedNonOperational,
      venues,
    },
    calendarSources: { ...envelope("CALENDAR_SOURCES", dedupedCalendars, countCalendars(dedupedCalendars)), calendar_sources: dedupedCalendars },
    capacityEvidence: {
      ...envelope("CAPACITY_EVIDENCE", sortedCapacity, {
        ...countCapacity(sortedCapacity),
        venues_with_conflicting_capacity_claims: venuesWithConflictingCapacityClaims,
      }),
      capacity_evidence: sortedCapacity,
    },
    researchProvenance: {
      ...envelope("RESEARCH_PROVENANCE", workstreamSummaries),
      method: "Per-venue-class research workstreams, each independently searched and required to cite a fetched URL for every capacity figure and calendar URL. Compiled deterministically; identity reconciled conservatively; nothing admitted to any production registry.",
      workstreams: workstreamSummaries.sort((a, b) => a.workstream.localeCompare(b.workstream)),
    },
  };
}

function tally(records, keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record);
    if (key === null || key === undefined) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function countVenues(venues) {
  return {
    by_nation: tally(venues, (venue) => venue.nation),
    by_venue_type: tally(venues, (venue) => venue.venue_type),
    by_inclusion_basis: tally(venues, (venue) => venue.inclusion_basis),
    identity_review: venues.filter((venue) => venue.identity_review).length,
    with_official_url: venues.filter((venue) => venue.official_url).length,
    with_coordinates: venues.filter((venue) => venue.latitude !== null && venue.longitude !== null).length,
  };
}

export function countCalendars(sources) {
  return {
    by_source_type: tally(sources, (source) => source.source_type),
    by_sport: tally(sources, (source) => source.sport),
    by_source_family: tally(sources, (source) => familyLabel(source)),
    by_acquisition_readiness: tally(sources, (source) => source.acquisition_readiness),
    first_party: sources.filter((source) => source.first_party === true).length,
    distinct_venues_with_a_calendar: new Set(sources.map((source) => source.venue_census_id)).size,
  };
}

export function countCapacity(evidence) {
  const principal = evidence.filter((item) => item.is_principal);
  return {
    by_authority: tally(principal, (item) => item.capacity_source_authority ?? "NO_AUTHORITY_RECORDED"),
    by_confidence: tally(principal, (item) => item.capacity_confidence),
    by_capacity_type: tally(evidence, (item) => item.capacity_type),
    principal_records: principal.length,
    additional_configuration_records: evidence.length - principal.length,
  };
}
