// BEATMAPPED-UK-MAJOR-EVENT-VENUE-ATTRIBUTION-01 — Phases 2/5/6/7.
//
// Resolves ONE Observation to zero or one census venue.
//
// THE CORE INVARIANT: source provenance is not event venue identity. A
// calendar source registered against Venue A can legitimately return an
// event whose own source says Venue B — an operator publishes its whole
// estate's fixtures on each venue's page. The census venue attached to the
// source is therefore NEVER inherited as the answer; it is only ever a
// candidate that must win on the same evidence as any other.
//
// This module produces a DERIVED decision. It never mutates the
// Observation it reads.

import { normaliseName, normalisePostcode, postcodeDistrict, governedNames, stripVenueTypeSuffix } from "./census-index.mjs";

export const ATTRIBUTION_STATES = new Set([
  "SOURCE_VENUE_MATCH",
  "RESOLVED_TO_DIFFERENT_CENSUS_VENUE",
  "UNRESOLVED_NO_VENUE_EVIDENCE",
  "UNRESOLVED_NO_CENSUS_MATCH",
  "AMBIGUOUS_MULTIPLE_CENSUS_MATCHES",
  "CONFLICTING_LOCATION_EVIDENCE",
]);

export const CONFIDENCE = new Set(["HIGH", "MEDIUM", "REVIEW"]);

/** Every geographic signal the SOURCE itself provided about this event. */
export function sourceGeography(observation) {
  const address = observation?.source_fields?.location_address ?? null;
  const locationText = observation?.location_text ?? null;
  const postcodeFromText = typeof locationText === "string"
    ? (locationText.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0] ?? null)
    : null;

  return {
    postcode: normalisePostcode(address?.postalCode ?? postcodeFromText),
    locality: address?.addressLocality ?? null,
    region: address?.addressRegion ?? null,
    street: address?.streetAddress ?? null,
    location_text: locationText,
  };
}

/**
 * Compare the source's geography against a candidate census venue.
 *
 * Returns one of:
 *   "CONFIRMS"   - the source's own location evidence positively places the
 *                  event at this venue (postcode, or the venue named in the
 *                  source's address text)
 *   "COMPATIBLE" - the locality/region agrees, or there is simply nothing
 *                  to contradict
 *   "CONFLICTS"  - the source's location evidence positively places the
 *                  event somewhere this venue is not
 *   "NO_EVIDENCE"- the source said nothing locational at all
 */
export function compareGeography(geo, venue) {
  const venuePostcode = normalisePostcode(venue.postcode);
  if (geo.postcode && venuePostcode) {
    if (geo.postcode === venuePostcode) return "CONFIRMS";
    // A different full postcode is a positive contradiction, unless the
    // districts agree (a large site can span units).
    return postcodeDistrict(geo.postcode) === postcodeDistrict(venue.postcode) ? "COMPATIBLE" : "CONFLICTS";
  }

  const haystack = normaliseName([geo.location_text, geo.street, geo.locality, geo.region].filter(Boolean).join(" "));
  if (haystack) {
    // The source's own address naming the venue is strong positive
    // evidence — "Weston Road, Stafford County Showground, ST18 0BD".
    for (const name of governedNames(venue)) {
      const normalised = normaliseName(name);
      if (normalised.length >= 6 && haystack.includes(normalised)) return "CONFIRMS";
    }
    const city = normaliseName(venue.city);
    if (city && haystack.includes(city)) return "COMPATIBLE";
    // The source named a place and it is not this venue's city. Only treat
    // that as a conflict when the source gave a structured locality — free
    // text may legitimately mention a road or region instead.
    if (geo.locality) {
      const locality = normaliseName(geo.locality);
      if (city && locality && !city.includes(locality) && !locality.includes(city)) return "CONFLICTS";
    }
    return "COMPATIBLE";
  }

  return "NO_EVIDENCE";
}

/** Candidate census venues whose governed names match the source's venue name. */
export function nameCandidates(sourceVenueName, index) {
  const normalised = normaliseName(sourceVenueName);
  if (normalised.length < 3) return { candidates: [], match_kind: null };

  const exact = index.byName.get(normalised) ?? [];
  if (exact.length) return { candidates: dedupe(exact), match_kind: "GOVERNED_NAME_OR_ALIAS" };

  // The source omitted a generic venue-type word ("Kempton Park" for
  // "Kempton Park Racecourse").
  const trimmed = index.bySuffixTrimmedName.get(normalised) ?? [];
  if (trimmed.length) return { candidates: dedupe(trimmed), match_kind: "GOVERNED_NAME_WITHOUT_VENUE_TYPE_SUFFIX" };

  // The SOURCE carried the generic suffix and the census name does not,
  // or carried a longer one ("Mallory Park RACING CIRCUIT" vs "Mallory
  // Park Circuit"). Compare both sides stripped to their core.
  const sourceCore = stripVenueTypeSuffix(normalised);
  if (sourceCore) {
    const direct = index.byName.get(sourceCore) ?? [];
    if (direct.length) return { candidates: dedupe(direct), match_kind: "SOURCE_CARRIED_EXTRA_VENUE_TYPE_SUFFIX" };
    const bothStripped = index.bySuffixTrimmedName.get(sourceCore) ?? [];
    if (bothStripped.length) return { candidates: dedupe(bothStripped), match_kind: "VENUE_TYPE_SUFFIX_DIFFERS_ON_BOTH_SIDES" };
  }

  // The source qualified the name with its city ("AO Arena Manchester").
  const cityQualified = index.byNameWithCity.get(normalised) ?? [];
  if (cityQualified.length) return { candidates: dedupe(cityQualified), match_kind: "GOVERNED_NAME_QUALIFIED_BY_CITY" };

  return { candidates: [], match_kind: null };
}

const dedupe = (venues) => [...new Map(venues.map((venue) => [venue.venue_census_id, venue])).values()];

/**
 * Resolve one Observation.
 *
 * `sourceCensusVenue` is the venue the SOURCE was researched under. It is
 * passed in for provenance and as one candidate among others — never as a
 * default answer.
 */
export function resolveObservation(observation, index, { derivedAt } = {}) {
  const sourceVenueName = observation?.venue_name ?? null;
  const sourceCensusVenueId = observation?.source_fields?.venue_census_id ?? null;
  const sourceCensusVenue = sourceCensusVenueId ? index.byId.get(sourceCensusVenueId) ?? null : null;
  const geo = sourceGeography(observation);

  const base = {
    observation_ref: { source_id: observation.source_id, source_record_id: observation.source_record_id },
    source_id: observation.source_id,
    source_record_id: observation.source_record_id,
    calendar_source_id: observation.source_fields?.calendar_source_id ?? null,
    source_census_venue_id: sourceCensusVenueId,
    source_census_venue_name: sourceCensusVenue?.canonical_name ?? observation.source_fields?.census_venue_name ?? null,
    source_reported_venue_name: sourceVenueName,
    source_reported_location_text: observation.location_text ?? null,
    event_domain: observation.source_fields?.event_domain ?? null,
    derived_at: derivedAt ?? null,
  };

  if (!sourceVenueName || normaliseName(sourceVenueName).length < 3) {
    return {
      ...base,
      resolved_venue_census_id: null,
      resolved_venue_name: null,
      attribution_state: "UNRESOLVED_NO_VENUE_EVIDENCE",
      attribution_method: null,
      confidence: "REVIEW",
      evidence: ["the source stated no usable venue name"],
      ambiguity_candidates: [],
    };
  }

  const { candidates, match_kind } = nameCandidates(sourceVenueName, index);

  if (candidates.length === 0) {
    // No governed census name matches what the source called the venue.
    // The source's ADDRESS may still positively identify a census venue —
    // this is how a named sub-space ("Bingley Hall") resolves when the
    // address names its parent site.
    const byAddress = index.venues.filter((venue) => compareGeography(geo, venue) === "CONFIRMS");
    const unique = dedupe(byAddress);
    if (unique.length === 1) {
      return finalise(base, unique[0], sourceCensusVenueId, {
        method: "SOURCE_ADDRESS_NAMES_CENSUS_VENUE",
        confidence: "HIGH",
        evidence: [
          `the source's own location evidence names this venue: ${JSON.stringify(geo.location_text ?? geo.postcode)}`,
          `the source called the venue ${JSON.stringify(sourceVenueName)}, which is not a governed census name — likely a named space within the site`,
        ],
      });
    }
    if (unique.length > 1) {
      return ambiguous(base, unique, "the source's location evidence positively matches more than one census venue");
    }
    return {
      ...base,
      resolved_venue_census_id: null,
      resolved_venue_name: null,
      attribution_state: "UNRESOLVED_NO_CENSUS_MATCH",
      attribution_method: null,
      confidence: "REVIEW",
      evidence: [`no governed census name or alias matches ${JSON.stringify(sourceVenueName)}, and the source's location evidence identifies no census venue`],
      ambiguity_candidates: [],
    };
  }

  // Score every name candidate on the source's own geography.
  const scored = candidates.map((venue) => ({ venue, geography: compareGeography(geo, venue) }));
  const confirms = scored.filter((item) => item.geography === "CONFIRMS");
  const compatible = scored.filter((item) => item.geography === "COMPATIBLE");
  const noEvidence = scored.filter((item) => item.geography === "NO_EVIDENCE");
  const conflicts = scored.filter((item) => item.geography === "CONFLICTS");

  if (confirms.length === 1) {
    return finalise(base, confirms[0].venue, sourceCensusVenueId, {
      method: `${match_kind}_WITH_CONFIRMING_GEOGRAPHY`,
      confidence: "HIGH",
      evidence: [
        `governed census name/alias matched ${JSON.stringify(sourceVenueName)}`,
        `the source's own location evidence confirms this venue (${geo.postcode ?? geo.location_text ?? "address"})`,
      ],
    });
  }
  if (confirms.length > 1) {
    return ambiguous(base, confirms.map((item) => item.venue), "several census venues match the name AND the location evidence");
  }

  const survivors = [...compatible, ...noEvidence];

  if (survivors.length === 0 && conflicts.length > 0) {
    return {
      ...base,
      resolved_venue_census_id: null,
      resolved_venue_name: null,
      attribution_state: "CONFLICTING_LOCATION_EVIDENCE",
      attribution_method: null,
      confidence: "REVIEW",
      evidence: [
        `the name ${JSON.stringify(sourceVenueName)} matches ${conflicts.length} census venue(s)`,
        `but the source's own location evidence contradicts every one of them`,
      ],
      ambiguity_candidates: conflicts.map((item) => candidateRef(item.venue)),
    };
  }

  if (survivors.length === 1) {
    const { venue, geography } = survivors[0];
    const geographyConfirmed = geography === "COMPATIBLE";
    return finalise(base, venue, sourceCensusVenueId, {
      method: geographyConfirmed ? `${match_kind}_WITH_COMPATIBLE_GEOGRAPHY` : `${match_kind}_NO_GEOGRAPHIC_EVIDENCE`,
      // A unique governed-name match with agreeing geography is strong. The
      // same match with NO geography at all is only medium: the census
      // holds names claimed by several venues, so absence of a competitor
      // here is not the same as proof.
      confidence: match_kind === "GOVERNED_NAME_OR_ALIAS" && geographyConfirmed ? "HIGH" : "MEDIUM",
      evidence: [
        `governed census name/alias matched ${JSON.stringify(sourceVenueName)} uniquely`,
        geographyConfirmed
          ? "the source's location evidence agrees with this venue"
          : "the source gave no location evidence, so this rests on the name alone",
      ],
    });
  }

  return ambiguous(base, survivors.map((item) => item.venue), `${survivors.length} census venues share this name and the source's location evidence does not separate them`);
}

const candidateRef = (venue) => ({
  venue_census_id: venue.venue_census_id,
  canonical_name: venue.canonical_name,
  city: venue.city,
  nation: venue.nation,
});

function ambiguous(base, venues, reason) {
  return {
    ...base,
    resolved_venue_census_id: null,
    resolved_venue_name: null,
    attribution_state: "AMBIGUOUS_MULTIPLE_CENSUS_MATCHES",
    attribution_method: null,
    confidence: "REVIEW",
    evidence: [reason],
    ambiguity_candidates: dedupe(venues).map(candidateRef),
  };
}

function finalise(base, venue, sourceCensusVenueId, { method, confidence, evidence }) {
  const sameAsSource = venue.venue_census_id === sourceCensusVenueId;
  const extra = [];

  // Parent/sub-venue semantics: if the resolved venue is a separately
  // represented sub-venue of the source's census venue (or vice versa),
  // say so explicitly rather than letting it read as a contradiction.
  if (!sameAsSource) {
    extra.push(`the source was researched under a DIFFERENT census venue (${base.source_census_venue_name}); source provenance is not venue identity, so it was not inherited`);
  }

  return {
    ...base,
    resolved_venue_census_id: venue.venue_census_id,
    resolved_venue_name: venue.canonical_name,
    resolved_venue_city: venue.city,
    resolved_venue_nation: venue.nation,
    attribution_state: sameAsSource ? "SOURCE_VENUE_MATCH" : "RESOLVED_TO_DIFFERENT_CENSUS_VENUE",
    attribution_method: method,
    confidence,
    evidence: [...evidence, ...extra],
    ambiguity_candidates: [],
  };
}

/** Resolve a whole dataset. Pure and deterministic for fixed inputs. */
export function resolveAll(observations, index, { derivedAt } = {}) {
  return observations.map((observation) => resolveObservation(observation, index, { derivedAt }));
}
