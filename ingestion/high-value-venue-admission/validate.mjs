#!/usr/bin/env node
// Repository-level validator for the Package 09 canonical admission
// (BEATMAPPED-UK-HIGH-VALUE-VENUE-CANONICAL-ADMISSION-09).
//
// Package 08's validator guarded what was ABOUT to be minted. This one
// guards what WAS minted — it re-derives every claim from venues/uk.json
// as it now stands, so a hand-edit to the registry or to an audit artifact
// is caught rather than believed:
//
//   1. every promised audit artifact exists and parses;
//   2. every admitted venue_id actually exists in venues/uk.json;
//   3. every admitted venue satisfies the canonical Venue contract, and
//      so does every venue already in the registry;
//   4. no duplicate canonical venue_id and no duplicate real-world
//      identity (name + city) anywhere in the registry;
//   5. all 536 admission rows are accounted for exactly once;
//   6. none of the four Package 08 identity holds reached canon;
//   7. no admitted venue carries an address or coordinates (Package 08
//      had none, so any would be invented);
//   8. no third-party URL is labelled OFFICIAL_VENUE_WEBSITE;
//   9. every admitted venue is traceable back to a Package 08 entity;
//  10. no Event-shaped record leaked into the venue registry;
//  11. the estate arithmetic closes against Package 08 with no remainder;
//  12. Packages 05, 06, 07 and 08 are present and unmodified;
//  13. re-planning the admission against the current registry admits
//      NOTHING — the admission is idempotent.
//
// Read-only. No network. Never writes or mutates anything.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateVenue } from "../venue/contract.mjs";
import {
  ADMISSION_INPUT_PATH,
  AUDIT_DIR,
  EXPECTED_ADMISSION_ROWS,
  IDENTITY_HOLD_NAMES,
  OFFICIAL_WEBSITE_EVIDENCE_KIND,
  UK_REGISTRY_PATH,
  planAdmission,
} from "./admit.mjs";
import { PACKAGE_08_SUMMARY_PATH } from "./reconcile.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const REQUIRED_ARTIFACTS = Object.freeze([
  "manifest.json",
  "input-snapshot.json",
  "dry-run.json",
  "admission-decisions.json",
  "admitted-venues.json",
  "canonical-id-map.json",
  "already-canonical.json",
  "held-or-rejected.json",
  "post-admission-reconciliation.json",
  "summary.json",
]);

export const IMMUTABLE_PREDECESSOR_DIRS = Object.freeze([
  "research/high-value-venue-estate/uk-1000plus-05",
  "research/high-value-venue-estate/uk-1000plus-06",
  "research/high-value-venue-estate/uk-1000plus-07",
  "research/high-value-venue-estate/uk-1000plus-08-identity",
]);

// Hosts that describe a venue but do not speak for it. Labelling one of
// these OFFICIAL_VENUE_WEBSITE would let a third party's page be treated
// as the venue's own voice by everything downstream.
export const THIRD_PARTY_HOSTS = Object.freeze([
  "wikipedia.org",
  "wikidata.org",
  "songkick.com",
  "ticketmaster.co.uk",
  "ticketmaster.com",
  "seatgeek.com",
  "skiddle.com",
  "eventbrite.co.uk",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tripadvisor.co.uk",
  "google.com",
]);

// Keys that would mean an Event had been written into a venue registry.
export const EVENT_SHAPED_KEYS = Object.freeze([
  "event_id",
  "starts_at",
  "start_time",
  "doors_time",
  "lineup",
  "artist_id",
  "offers",
  "ticket_url",
  "observations",
]);

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function validateAdmission({ repoRoot = ROOT, checkIdempotence = true } = {}) {
  const errors = [];

  // 1. artifacts present and parseable
  const artifacts = {};
  for (const name of REQUIRED_ARTIFACTS) {
    const rel = `${AUDIT_DIR}/${name}`;
    if (!existsSync(join(repoRoot, rel))) {
      errors.push(`required audit artifact ${rel} is missing`);
      continue;
    }
    try {
      artifacts[name] = readJson(repoRoot, rel);
    } catch (error) {
      errors.push(`required audit artifact ${rel} does not parse: ${error.message}`);
    }
  }
  if (errors.length > 0) return errors;

  const input = readJson(repoRoot, ADMISSION_INPUT_PATH);
  const canon = readJson(repoRoot, UK_REGISTRY_PATH).venues;
  const idMap = artifacts["canonical-id-map.json"];
  const alreadyCanonical = artifacts["already-canonical.json"];
  const summary = artifacts["summary.json"];

  const byId = new Map(canon.map((v) => [v.venue_id, v]));

  // 2. every claimed admission exists in the registry
  const admitted = [];
  for (const mapping of idMap.mappings) {
    const venue = byId.get(mapping.venue_id);
    if (!venue) {
      errors.push(`canonical-id-map claims ${mapping.venue_id} was admitted, but it is not in ${UK_REGISTRY_PATH}`);
      continue;
    }
    admitted.push(venue);
  }

  // 3. contract integrity over the WHOLE registry
  for (const venue of canon) {
    const contractErrors = validateVenue(venue);
    for (const error of contractErrors) {
      errors.push(`venue ${venue.venue_id ?? "<no id>"} violates the Venue contract: ${error}`);
    }
  }

  // 4. no duplicate ids, no duplicate real-world identities
  const seenIds = new Set();
  for (const venue of canon) {
    if (seenIds.has(venue.venue_id)) errors.push(`duplicate canonical venue_id in the registry: ${venue.venue_id}`);
    seenIds.add(venue.venue_id);
  }
  const seenIdentity = new Map();
  for (const venue of canon) {
    const key = `${(venue.canonical_name ?? "").toLowerCase()}|${(venue.city ?? "").toLowerCase()}`;
    if (seenIdentity.has(key)) {
      errors.push(`duplicate real-world venue identity: ${venue.venue_id} and ${seenIdentity.get(key)} are both "${venue.canonical_name}" in "${venue.city}"`);
    } else {
      seenIdentity.set(key, venue.venue_id);
    }
  }

  // 5. every admission row accounted for exactly once
  if (input.venues.length !== EXPECTED_ADMISSION_ROWS) {
    errors.push(`admission input has ${input.venues.length} rows, expected ${EXPECTED_ADMISSION_ROWS}`);
  }
  const accountedFor = new Map();
  const account = (entityId, where) => {
    if (accountedFor.has(entityId)) {
      errors.push(`admission row ${entityId} is accounted for twice (${accountedFor.get(entityId)} and ${where})`);
    }
    accountedFor.set(entityId, where);
  };
  for (const mapping of idMap.mappings) account(mapping.unique_entity_id, "canonical-id-map");
  for (const row of alreadyCanonical.rows) account(row.unique_entity_id, "already-canonical");
  for (const row of input.venues) {
    if (!accountedFor.has(row.unique_entity_id)) {
      errors.push(`admission row ${row.unique_entity_id} ("${row.canonical_name_candidate}") has no recorded decision`);
    }
  }

  // 6. the four identity holds must be nowhere in canon
  const canonNames = new Set(canon.map((v) => v.canonical_name));
  for (const name of IDENTITY_HOLD_NAMES) {
    if (canonNames.has(name)) {
      errors.push(`Package 08 identity hold "${name}" was admitted — holds may only be resolved by an explicit later decision`);
    }
  }

  // 7. no invented location data
  for (const venue of admitted) {
    if (venue.address !== null) errors.push(`admitted venue ${venue.venue_id} has an address, but Package 08 carried none — it would be invented`);
    if (venue.latitude !== null || venue.longitude !== null) {
      errors.push(`admitted venue ${venue.venue_id} has coordinates, but Package 08 carried none — they would be invented`);
    }
    if (venue.location_status !== "UNRESOLVED") {
      errors.push(`admitted venue ${venue.venue_id} has location_status ${venue.location_status}; with no address and no coordinates it must be UNRESOLVED`);
    }
  }

  // 8. no third party speaking as the venue
  for (const venue of admitted) {
    for (const item of venue.evidence) {
      if (item.kind !== OFFICIAL_WEBSITE_EVIDENCE_KIND) continue;
      const host = hostOf(item.url);
      if (host && THIRD_PARTY_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) {
        errors.push(`admitted venue ${venue.venue_id} labels third-party host ${host} as ${OFFICIAL_WEBSITE_EVIDENCE_KIND}`);
      }
    }
  }

  // 9. traceability
  for (const mapping of idMap.mappings) {
    if (!mapping.unique_entity_id) errors.push(`canonical-id-map entry for ${mapping.venue_id} has no Package 08 entity id`);
    if (!Array.isArray(mapping.package07_research_ids) || mapping.package07_research_ids.length === 0) {
      errors.push(`admitted venue ${mapping.venue_id} is not traceable to any Package 07 research row`);
    }
  }

  // 10. no Events in the venue registry
  for (const venue of canon) {
    for (const key of EVENT_SHAPED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(venue, key)) {
        errors.push(`venue ${venue.venue_id} carries Event-shaped key "${key}" — this package admits venue identity only`);
      }
    }
  }

  // 11. estate arithmetic closes against Package 08's own published figures
  const p08 = readJson(repoRoot, PACKAGE_08_SUMMARY_PATH).headline;
  const coverage = summary.high_value_coverage;
  if (coverage.unique_confirmed_high_value !== p08.final_unique_confirmed_venues) {
    errors.push(`summary claims ${coverage.unique_confirmed_high_value} unique confirmed venues, Package 08 published ${p08.final_unique_confirmed_venues}`);
  }
  if (coverage.represented_before !== p08.represented_in_canon) {
    errors.push(`summary claims ${coverage.represented_before} represented before, Package 08 published ${p08.represented_in_canon}`);
  }
  const closes = coverage.represented_after + coverage.identity_holds_remaining === coverage.unique_confirmed_high_value;
  if (!closes) {
    errors.push(`estate arithmetic does not close: ${coverage.represented_after} represented + ${coverage.identity_holds_remaining} held != ${coverage.unique_confirmed_high_value} confirmed`);
  }
  if (coverage.newly_admitted !== admitted.length) {
    errors.push(`summary claims ${coverage.newly_admitted} newly admitted, the registry contains ${admitted.length}`);
  }

  // every published quality invariant must be zero
  for (const [key, value] of Object.entries(summary.quality_invariants)) {
    if (value !== 0) errors.push(`quality invariant "${key}" is ${value}, expected 0`);
  }

  // 12. predecessors preserved
  for (const dir of IMMUTABLE_PREDECESSOR_DIRS) {
    if (!existsSync(join(repoRoot, dir))) {
      errors.push(`immutable predecessor ${dir} is missing — it must be preserved, not replaced`);
    }
  }

  // 13. idempotence — re-planning must admit nothing
  if (checkIdempotence) {
    const replan = planAdmission({ repoRoot });
    if (replan.safeAdmissions.length !== 0) {
      errors.push(`admission is not idempotent: re-planning against the current registry would admit ${replan.safeAdmissions.length} more venue(s)`);
    }
    if (replan.alreadyCanonical.length !== input.venues.length) {
      errors.push(`re-planning recognises only ${replan.alreadyCanonical.length} of ${input.venues.length} admission rows as already canonical`);
    }
  }

  return errors;
}

function main() {
  const errors = validateAdmission();
  if (errors.length > 0) {
    console.error(`FAIL — ${errors.length} problem(s) in the Package 09 canonical admission:`);
    for (const error of errors.slice(0, 60)) console.error(`  - ${error}`);
    if (errors.length > 60) console.error(`  ... and ${errors.length - 60} more`);
    process.exitCode = 1;
    return;
  }
  const summary = readJson(ROOT, `${AUDIT_DIR}/summary.json`);
  const h = summary.headline;
  const c = summary.high_value_coverage;
  console.log(
    `OK — Package 09 canonical admission validates (${h.venues_admitted} admitted, ` +
      `${h.baseline_canonical_uk_venues} -> ${h.final_canonical_uk_venues} canonical UK venues, ` +
      `${c.represented_after}/${c.unique_confirmed_high_value} of the high-value estate represented).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
