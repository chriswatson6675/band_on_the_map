// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — the ONE collector.
//
// A single generic collector for every tenant of the shared gc football
// platform. It is driven entirely by what each served page and the
// platform's own public API declare. There is no per-club branch, no
// club/domain/stadium constant, and no bespoke path anywhere in this
// directory — a test asserts that.
//
// Read-only: bounded GETs, no mutation, no publication.

import { fetchText } from "../http/fetch.mjs";
import { detectPlatform } from "./detect.mjs";
import { fetchMatches, fetchTeams } from "./client.mjs";
import { recordId, toObservation } from "./record.mjs";

/** Canonical terminal states. Every source ends at exactly one. */
export const TERMINAL_STATES = new Set([
  "ACQUISITION_PROVEN",
  "NETWORK_FAILURE",
  "ACCESS_BLOCKED",
  "PROGRAMME_EMPTY",
  "SUPPORTED_COLLECTOR_NO_VALID_EVENTS",
  "STABLE_IDENTITY_PROOF_FAILED",
  "SOURCE_FINGERPRINT_UNSUPPORTED",
]);

const NETWORK_ERRORS = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|abort|timeout|socket/i;

/** Bound on how many candidate services hosts one page may have tried. */
export const MAX_HOST_CANDIDATES = 3;

/**
 * Collect one gc source.
 *
 * @param {object} source  { source_id, source_url, census_venue_id?, census_venue_name? }
 */
export async function collectSource(source, { now = () => new Date().toISOString(), timeoutMs = 25000 } = {}) {
  const retrievedAt = now();
  const result = {
    source_id: source.source_id,
    source_url: source.source_url,
    census_venue_id: source.census_venue_id ?? null,
    census_venue_name: source.census_venue_name ?? null,
    retrieved_at: retrievedAt,
    terminal_state: null,
    detection: null,
    services_host: null,
    club_id: null,
    teams: [],
    routes: [],
    observations: [],
    diagnostics: {},
  };

  // --- 1. the served page: detection + tenant configuration -------------
  let page;
  try {
    page = await fetchText(source.source_url, { timeoutMs });
  } catch (error) {
    result.terminal_state = NETWORK_ERRORS.test(String(error?.message)) ? "NETWORK_FAILURE" : "NETWORK_FAILURE";
    result.diagnostics.error = String(error?.message ?? error);
    return result;
  }

  result.routes.push({ url: source.source_url, status: page.status, kind: "PAGE" });

  if (!page.ok) {
    result.terminal_state = page.status === 403 || page.status === 401 || page.status === 429 ? "ACCESS_BLOCKED" : "NETWORK_FAILURE";
    result.diagnostics.page_status = page.status;
    return result;
  }

  const detected = detectPlatform({ html: page.text, status: page.status });
  result.detection = detected.detection;
  result.club_id = detected.club_id;
  result.diagnostics.detection_signals = detected.signals;
  result.diagnostics.detection_evidence = detected.evidence;

  if (detected.detection === "NOT_GC_PLATFORM") {
    result.terminal_state = "SOURCE_FINGERPRINT_UNSUPPORTED";
    return result;
  }

  // --- 2. resolve the tenant against the LIVE public API ----------------
  // The page signature is only a hypothesis. Some clubs use gc image/CMS
  // hosting while publishing fixtures elsewhere, and others publish under
  // two services domains. Each candidate host is therefore tried against
  // the public teams route, bounded, and the first that genuinely answers
  // is the tenant. A candidate that does not answer is not a tenant.
  let teamsResponse = null;
  const attempts = [];

  for (const host of detected.candidate_services_hosts.slice(0, MAX_HOST_CANDIDATES)) {
    let response;
    try {
      response = await fetchTeams(host, { timeoutMs });
    } catch (error) {
      attempts.push({ services_host: host, status: null, teams: 0, error: String(error?.message ?? error) });
      continue;
    }
    result.routes.push({ url: response.url, status: response.status, kind: "TEAMS" });
    attempts.push({ services_host: host, status: response.status, teams: response.teams.length });
    if (response.ok && response.teams.length > 0) {
      teamsResponse = response;
      result.services_host = host;
      break;
    }
  }

  result.diagnostics.host_resolution = attempts;

  if (!teamsResponse) {
    const blocked = attempts.some((attempt) => attempt.status === 401 || attempt.status === 403 || attempt.status === 429);
    const answered = attempts.some((attempt) => attempt.status === 200);
    if (answered) {
      // The fixture service exists for this tenant but declares no teams.
      result.terminal_state = "PROGRAMME_EMPTY";
      result.diagnostics.reason = "the platform's public fixture service declared no teams for this tenant";
    } else if (blocked) {
      result.terminal_state = "ACCESS_BLOCKED";
    } else {
      // A gc signature on the page, but no gc FOOTBALL tenant behind it —
      // typically a club using gc media hosting while publishing its
      // fixtures on an entirely different platform.
      result.terminal_state = "SOURCE_FINGERPRINT_UNSUPPORTED";
      result.diagnostics.reason = "page carries a gc signature but no candidate host serves the public football fixture API";
    }
    return result;
  }

  result.detection = "PLATFORM_CONFIRMED";

  // --- 3. fixtures for each declared team, latest season -----------------
  const raw = [];
  for (const team of teamsResponse.teams) {
    // seasons[0] is the platform's own latest, as its first-party client uses.
    const season = Array.isArray(team.seasons) ? team.seasons[0] : null;
    const seasonId = season?.seasonID ?? null;
    const teamSummary = {
      team_id: team.id,
      team_name: team.teamName ?? null,
      season_id: seasonId,
      season_slug: season?.seasonSlug ?? null,
      records: 0,
    };

    if (!seasonId) {
      teamSummary.skipped = "NO_SEASON_DECLARED";
      result.teams.push(teamSummary);
      continue;
    }

    let matches;
    try {
      matches = await fetchMatches(result.services_host, { teamId: team.id, seasonId }, { timeoutMs });
    } catch (error) {
      teamSummary.skipped = "TRANSPORT_ERROR";
      teamSummary.error = String(error?.message ?? error);
      result.teams.push(teamSummary);
      continue;
    }
    for (const route of matches.pages) result.routes.push({ ...route, kind: "MATCHES" });

    if (!matches.ok) {
      teamSummary.skipped = `HTTP_${matches.status}`;
      result.teams.push(teamSummary);
      continue;
    }

    teamSummary.records = matches.records.length;
    result.teams.push(teamSummary);
    for (const record of matches.records) raw.push({ record, team });
  }

  const reachedAny = result.teams.some((team) => !team.skipped);
  if (!reachedAny) {
    const blocked = result.teams.some((team) => /HTTP_(401|403|429)/.test(team.skipped ?? ""));
    result.terminal_state = blocked ? "ACCESS_BLOCKED" : "NETWORK_FAILURE";
    return result;
  }

  if (raw.length === 0) {
    result.terminal_state = "PROGRAMME_EMPTY";
    result.diagnostics.reason = "every declared team returned an empty fixture programme";
    return result;
  }

  // --- 4. stable identity ------------------------------------------------
  // The platform's matchID is its own stable record identity. Where one id
  // appears under more than one team list, it is the same match seen twice
  // within the SAME source — collapsed only when the two rows genuinely
  // agree. Rows that disagree are a real identity collision and are
  // dropped rather than guessed at. Nothing here merges across sources.
  const byId = new Map();
  let missingId = 0;
  for (const entry of raw) {
    const id = recordId(entry.record);
    if (!id) { missingId += 1; continue; }
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(entry);
  }

  const fingerprint = (record) => `${record?.kickOffUTC ?? ""}|${record?.venue ?? ""}|${record?.competitionName ?? ""}`;
  const usable = [];
  let collapsed = 0;
  let collided = 0;

  for (const [, entries] of byId) {
    if (entries.length === 1) { usable.push(entries[0]); continue; }
    const prints = new Set(entries.map((entry) => fingerprint(entry.record)));
    if (prints.size === 1) { usable.push(entries[0]); collapsed += entries.length - 1; }
    else collided += entries.length;
  }

  result.diagnostics.identity = {
    raw_records: raw.length,
    distinct_platform_ids: byId.size,
    records_without_id: missingId,
    duplicate_rows_collapsed: collapsed,
    colliding_rows_dropped: collided,
  };

  if (usable.length === 0) {
    result.terminal_state = "STABLE_IDENTITY_PROOF_FAILED";
    result.diagnostics.reason = "no record carried a unique, stable platform identifier";
    return result;
  }

  // --- 5. Observations ---------------------------------------------------
  const observations = [];
  let unmappable = 0;
  for (const entry of usable) {
    const observation = toObservation(entry.record, {
      source_id: source.source_id,
      retrieved_at: retrievedAt,
      source_url: source.source_url,
      team_label: entry.team.teamName ?? null,
    });
    if (observation) observations.push(observation);
    else unmappable += 1;
  }

  result.diagnostics.unmappable_records = unmappable;
  result.observations = observations;
  result.terminal_state = observations.length > 0 ? "ACQUISITION_PROVEN" : "SUPPORTED_COLLECTOR_NO_VALID_EVENTS";
  return result;
}
