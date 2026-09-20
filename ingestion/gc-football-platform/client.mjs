// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — public route client.
//
// ROUTE PROVENANCE (how these URLs were established — not guessed):
//
//   1. The served club page publishes its own gc services host (see
//      detect.mjs). No URL here is inferred from a club's domain name.
//   2. The page's own first-party JS bundle contains two API clients:
//        * `FootballCMS` — builds `https://<svc>.football.ADMIN.gc.<host>/v1/...`
//          and sends an `Authorization` header on every call. This is the
//          authenticated CMS client and is NOT used here. Called without
//          credentials it returns HTTP 403.
//        * `FootballWeb`  — builds `https://<svc>.football.WEB.gc.<host>/v2/...`
//          and calls `fetch(url)` with NO headers at all. This is the
//          public web client whose routes the browser uses to render the
//          public fixture list.
//   3. Only the unauthenticated `FootballWeb` v2 routes are implemented
//      here, verbatim as that client constructs them:
//        getTeams()    -> `${getFilterUrl(2)}/filters`
//                      -> https://filters.football.web.gc.<host>/v2/filters
//        getFixtures() -> `${getUrl("matches",2)}/opta?clientMatches=true
//                          &teamID=..&seasonID=..&pageSize=..&pageNumber=..`
//   4. Both were confirmed live to return HTTP 200 with no credentials.
//
// This client is read-only: it issues bounded GETs and never mutates.
// It contains no club, domain or stadium constant.

import { fetchText } from "../http/fetch.mjs";

const PAGE_SIZE = 100;
/** Hard bound so a misbehaving tenant can never drive an unbounded crawl. */
export const MAX_PAGES = 5;

/** `getFilterUrl(2)` + "/filters" from the first-party FootballWeb client. */
export function teamsUrl(servicesHost) {
  return `https://filters.football.web.gc.${servicesHost}/v2/filters`;
}

/** `getUrl("matches", 2)` + "/opta?clientMatches=true..." from that client. */
export function matchesUrl(servicesHost, { teamId, seasonId, pageNumber = 1, pageSize = PAGE_SIZE }) {
  const query = new URLSearchParams({
    clientMatches: "true",
    teamID: String(teamId),
    seasonID: String(seasonId),
    pageSize: String(pageSize),
    pageNumber: String(pageNumber),
  });
  return `https://matches.football.web.gc.${servicesHost}/v2/opta?${query}`;
}

async function getJson(url, { timeoutMs = 25000 } = {}) {
  const response = await fetchText(url, { timeoutMs });
  if (!response.ok) {
    return { ok: false, status: response.status, url, body: null, text: response.text };
  }
  try {
    return { ok: true, status: response.status, url, body: JSON.parse(response.text), text: response.text };
  } catch {
    return { ok: false, status: response.status, url, body: null, text: response.text, parse_error: true };
  }
}

/**
 * The tenant's teams, each with the seasons the platform holds for it.
 * Shape follows the first-party client: `data[].{id, attributes}`.
 */
export async function fetchTeams(servicesHost, options = {}) {
  const url = teamsUrl(servicesHost);
  const result = await getJson(url, options);
  if (!result.ok) return { ...result, teams: [] };

  const teams = (Array.isArray(result.body?.data) ? result.body.data : [])
    .map((entry) => ({ id: entry.id, ...(entry.attributes ?? {}) }))
    .filter((team) => team.id);

  return { ...result, teams };
}

/**
 * Every match record the platform publishes for one team/season, paging
 * until a short page is returned or MAX_PAGES is reached.
 */
export async function fetchMatches(servicesHost, { teamId, seasonId }, options = {}) {
  const records = [];
  const pages = [];

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const url = matchesUrl(servicesHost, { teamId, seasonId, pageNumber });
    const result = await getJson(url, options);
    pages.push({ url, status: result.status, ok: result.ok });

    if (!result.ok) return { ok: false, status: result.status, records, pages, failed_url: url };

    const rows = Array.isArray(result.body?.body) ? result.body.body : [];
    records.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  return { ok: true, status: 200, records, pages };
}
