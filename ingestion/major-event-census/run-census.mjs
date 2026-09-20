// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-01 — the census build CLI.
//
//   node ingestion/major-event-census/run-census.mjs compile
//   node ingestion/major-event-census/run-census.mjs fingerprint [--limit N] [--concurrency N]
//   node ingestion/major-event-census/run-census.mjs summarise
//
// `compile` is pure and offline. `fingerprint` is the only step that
// touches the network, and only to GET each already-researched calendar
// URL once so the SHARED fingerprint engine can classify it. Nothing
// here acquires events, and nothing writes outside the census research
// directory.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileCensus, countCalendars, familyLabel } from "./compile.mjs";
import { fingerprintCalendarSources, readinessFromFingerprint } from "./fingerprint-sources.mjs";
import { auditSourceFamilies, applyAuditVerdicts } from "./audit-source-families.mjs";
import { auditOfficialUrls, INVALID_URL_VERDICTS } from "./audit-official-urls.mjs";
import { validateCensusArtifact } from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CENSUS_DIR = resolve(ROOT, "research/major-event-venues/uk-major-event-census-01");
const WORKSTREAM_DIR = resolve(CENSUS_DIR, "workstreams");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

const patchKey = (name, city) => `${String(name ?? "").toLowerCase().trim()}|${String(city ?? "").toLowerCase().trim()}`;

/**
 * Load the venue-class workstreams, then apply any calendar patch files
 * (`*-calendars.json`) on top. Calendar discovery is a separate, later
 * research pass from venue discovery, so patches are kept as their own
 * additive files rather than rewriting a completed workstream in place —
 * a patch can only ADD calendar sources to a venue that already exists,
 * never invent a venue, change a capacity, or remove anything.
 */
async function loadWorkstreams() {
  const files = (await readdir(WORKSTREAM_DIR)).filter((name) => name.endsWith(".json")).sort();
  const documents = [];
  const patches = [];
  for (const file of files) {
    try {
      const document = await readJson(resolve(WORKSTREAM_DIR, file));
      const isPatch = Array.isArray(document?.calendar_patches) || Array.isArray(document?.identity_findings);
      if (isPatch) patches.push({ file, document });
      else documents.push(document);
    } catch (error) {
      console.error(`SKIPPED unreadable workstream ${file}: ${error.message}`);
    }
  }

  if (patches.length) {
    const index = new Map();
    for (const document of documents) {
      for (const venue of document.venues ?? []) index.set(patchKey(venue.canonical_name, venue.city), venue);
    }
    let applied = 0;
    let unmatched = 0;
    let identityApplied = 0;
    let identityUnmatched = 0;
    let statusApplied = 0;
    let statusUnmatched = 0;
    for (const { file, document } of patches) {
      for (const patch of document.calendar_patches ?? []) {
        const venue = index.get(patchKey(patch.canonical_name, patch.city));
        if (!venue) { unmatched += 1; continue; }
        const existing = new Set((venue.calendar_sources ?? []).map((source) => source.source_url));
        for (const source of patch.calendar_sources ?? []) {
          if (!source?.source_url || existing.has(source.source_url)) continue;
          existing.add(source.source_url);
          venue.calendar_sources = [...(venue.calendar_sources ?? []), source];
          venue.evidence = [...(venue.evidence ?? []), { kind: "FETCHED_URL", value: source.source_url, note: `calendar source added by ${file}` }];
          applied += 1;
        }
      }

      // Identity findings quarantine a URL proven not to belong to its
      // venue. The bad URL is MOVED, never deleted, so the census keeps
      // showing that the domain was checked and rejected — and a
      // replacement is only accepted when the finding actually supplies
      // one with its own cited evidence.
      for (const finding of document.identity_findings ?? []) {
        const venue = index.get(patchKey(finding.canonical_name, finding.city));
        if (!venue) { identityUnmatched += 1; continue; }
        const bad = finding.invalid_official_url ?? venue.official_url;
        const replacement = finding.current_official_url ?? null;
        if (bad && venue.official_url && venue.official_url !== bad && venue.official_url !== replacement) continue;
        venue.official_url_quarantined = bad ?? null;
        venue.official_url_quarantine_reason = finding.invalid_reason ?? "proven not to belong to this venue";
        venue.official_url = replacement;
        venue.official_url_status = replacement ? "OFFICIAL_URL_REPLACED" : "OFFICIAL_URL_REVIEW_REQUIRED";
        venue.evidence = [
          ...(venue.evidence ?? []).filter((item) => item?.value !== bad),
          { kind: "REJECTED_URL", value: bad ?? "(none recorded)", note: `quarantined by ${file}: ${venue.official_url_quarantine_reason}` },
          ...(Array.isArray(finding.evidence) ? finding.evidence : []),
        ];
        identityApplied += 1;
      }

      // Status findings correct a venue's operational state on evidence.
      // A capacity figure evidences PAST scale; it never evidences present
      // operation. The Camrose was carried OPERATIONAL at 6,000 solely
      // because an old capacity source existed, while its council's own
      // Cabinet report recorded that football use ceased before 2019.
      const statusFindings = [
        ...(Array.isArray(document.status_findings) ? document.status_findings : []),
        ...(document.camrose_finding ? [document.camrose_finding] : []),
      ];
      for (const finding of statusFindings) {
        const venue = index.get(patchKey(finding.canonical_name, finding.city));
        if (!venue || !finding.resolved_status) { statusUnmatched += venue ? 0 : 1; continue; }
        venue.operational_status = finding.resolved_status;
        venue.evidence = [
          ...(venue.evidence ?? []),
          { kind: "STATUS_FINDING", value: finding.resolved_status, note: `${file}: ${finding.reasoning ?? "operational status corrected on evidence"}` },
          ...(finding.historical_capacity_note ? [{ kind: "HISTORICAL_NOTE", value: finding.historical_capacity_note, note: `${file}: the recorded capacity describes past use, not present operation` }] : []),
          ...(Array.isArray(finding.evidence) ? finding.evidence : []),
        ];
        statusApplied += 1;
      }
    }
    console.log(`calendar patches applied: ${applied}${unmatched ? ` (${unmatched} patch entries matched no census venue and were ignored)` : ""}`);
    if (identityApplied || identityUnmatched) {
      console.log(`identity findings applied: ${identityApplied}${identityUnmatched ? ` (${identityUnmatched} matched no census venue and were ignored)` : ""}`);
    }
    if (statusApplied || statusUnmatched) {
      console.log(`operational-status findings applied: ${statusApplied}${statusUnmatched ? ` (${statusUnmatched} matched no census venue and were ignored)` : ""}`);
    }
  }

  return documents;
}

/** Calendar-recovery outcomes reported by patch files, for the provenance artifact. */
async function loadRecoveryOutcomes() {
  const files = (await readdir(WORKSTREAM_DIR)).filter((name) => name.endsWith(".json")).sort();
  const outcomes = [];
  for (const file of files) {
    try {
      const document = await readJson(resolve(WORKSTREAM_DIR, file));
      for (const outcome of document?.no_calendar_outcomes ?? []) {
        outcomes.push({ ...outcome, reported_by: file });
      }
    } catch {
      // Unreadable files are already reported by loadWorkstreams().
    }
  }
  return outcomes;
}

async function compile() {
  const documents = await loadWorkstreams();
  const generatedAt = new Date().toISOString();
  const compiled = compileCensus(documents, { generatedAt });

  // Compilation is a pure rebuild from the workstreams, but fingerprinting
  // is an expensive networked step — so any fingerprint result already
  // recorded for a calendar source (keyed by its own deterministic id) is
  // carried forward rather than discarded and re-fetched.
  try {
    const previous = await readJson(resolve(CENSUS_DIR, "calendar-sources.json"));
    const byId = new Map((previous.calendar_sources ?? []).filter((source) => source.fingerprinted_at).map((source) => [source.calendar_source_id, source]));
    let carried = 0;
    compiled.calendarSources.calendar_sources = compiled.calendarSources.calendar_sources.map((source) => {
      const prior = byId.get(source.calendar_source_id);
      if (!prior) return source;
      carried += 1;
      return {
        ...source,
        source_family: prior.source_family, source_family_signals: prior.source_family_signals,
        collector_route: prior.collector_route, acquisition_readiness: prior.acquisition_readiness,
        http_status: prior.http_status, fingerprinted_at: prior.fingerprinted_at, fingerprint_error: prior.fingerprint_error,
        // Phase 15 audit verdicts are evidence too — without carrying them
        // a recompile would keep the downgraded readiness but silently lose
        // the reason for it.
        ...(prior.family_audit_verdict ? {
          family_audit_verdict: prior.family_audit_verdict,
          family_audit_detail: prior.family_audit_detail,
          family_audit_checked_at: prior.family_audit_checked_at,
        } : {}),
      };
    });
    compiled.calendarSources.counts = { records: compiled.calendarSources.calendar_sources.length, ...countCalendars(compiled.calendarSources.calendar_sources) };
    if (carried) console.log(`carried forward ${carried} existing fingerprint results`);
  } catch {
    // No previous calendar artifact — a first compile, nothing to carry.
  }

  const errors = validateCensusArtifact({
    venues: compiled.venues.venues,
    calendarSources: compiled.calendarSources.calendar_sources,
    capacityEvidence: compiled.capacityEvidence.capacity_evidence,
  });

  await writeJson(resolve(CENSUS_DIR, "venues.json"), compiled.venues);
  await writeJson(resolve(CENSUS_DIR, "calendar-sources.json"), compiled.calendarSources);
  await writeJson(resolve(CENSUS_DIR, "capacity-evidence.json"), compiled.capacityEvidence);
  // Calendar-recovery attempts are retained even when they found nothing:
  // "we looked and there is no public calendar" is a finding, and without
  // it a later pass cannot tell an unexamined venue from an examined one.
  const recoveryOutcomes = await loadRecoveryOutcomes();
  const recoveryCounts = {};
  for (const outcome of recoveryOutcomes) {
    const key = outcome?.outcome ?? "OUTCOME_NOT_STATED";
    recoveryCounts[key] = (recoveryCounts[key] ?? 0) + 1;
  }
  await writeJson(resolve(CENSUS_DIR, "research-provenance.json"), {
    ...compiled.researchProvenance,
    calendar_recovery: {
      attempts: recoveryOutcomes.length,
      by_outcome: Object.fromEntries(Object.entries(recoveryCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
      outcomes: recoveryOutcomes.sort((a, b) => String(a.canonical_name).localeCompare(String(b.canonical_name))),
    },
  });

  console.log(`workstreams: ${documents.length}`);
  console.log(`venues: ${compiled.venues.venues.length}`);
  console.log(`calendar sources: ${compiled.calendarSources.calendar_sources.length}`);
  console.log(`capacity evidence records: ${compiled.capacityEvidence.capacity_evidence.length}`);
  console.log(`validation errors: ${errors.length}`);
  for (const error of errors.slice(0, 40)) console.log(`  - ${error}`);
  if (errors.length > 40) console.log(`  ... and ${errors.length - 40} more`);
}

async function fingerprint(argv) {
  const limit = Number(argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? Infinity);
  const concurrency = Number(argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] ?? 4);
  const force = argv.includes("--force");
  const path = resolve(CENSUS_DIR, "calendar-sources.json");
  const document = await readJson(path);
  const sources = document.calendar_sources;

  // Incremental by default: a source already fingerprinted keeps its
  // result and is not re-fetched, so a later research pass that ADDS
  // calendar sources only costs requests for the genuinely new ones.
  const alreadyDone = new Map(force ? [] : sources.filter((source) => source.fingerprinted_at).map((source) => [source.calendar_source_id, source]));
  const pending = sources.filter((source) => !alreadyDone.has(source.calendar_source_id));
  console.log(`fingerprinting ${Math.min(pending.length, limit)} of ${pending.length} pending (${alreadyDone.size} already done, ${sources.length} total, concurrency ${concurrency})...`);

  const fingerprinted = await fingerprintCalendarSources(pending, {
    limit, concurrency,
    onProgress: (done, total) => { if (done % 20 === 0 || done === total) console.log(`  ${done}/${total}`); },
  });

  document.calendar_sources = [...alreadyDone.values(), ...fingerprinted].sort((a, b) => a.calendar_source_id.localeCompare(b.calendar_source_id));
  document.counts = { records: document.calendar_sources.length, ...countCalendars(document.calendar_sources) };
  document.fingerprinted_at = new Date().toISOString();
  await writeJson(path, document);
  console.log("readiness:", JSON.stringify(document.counts.by_acquisition_readiness, null, 2));
  console.log("families:", JSON.stringify(document.counts.by_source_family, null, 2));
}

/** Deterministic, human-readable analytical summaries derived only from the artifacts. */
async function summarise() {
  const venuesDoc = await readJson(resolve(CENSUS_DIR, "venues.json"));
  const calendarsDoc = await readJson(resolve(CENSUS_DIR, "calendar-sources.json"));
  const capacityDoc = await readJson(resolve(CENSUS_DIR, "capacity-evidence.json"));
  const venues = venuesDoc.venues;
  const calendars = calendarsDoc.calendar_sources;
  const capacity = capacityDoc.capacity_evidence;

  const calendarsByVenue = new Map();
  for (const source of calendars) calendarsByVenue.set(source.venue_census_id, [...(calendarsByVenue.get(source.venue_census_id) ?? []), source]);
  const principalCapacity = new Map(capacity.filter((item) => item.is_principal).map((item) => [item.venue_census_id, item]));

  const tally = (items, keyFn) => {
    const counts = {};
    for (const item of items) { const key = keyFn(item); if (key == null) continue; counts[key] = (counts[key] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  };
  const hasType = (venueId, type) => (calendarsByVenue.get(venueId) ?? []).some((source) => source.source_type === type);

  // Operator estates — the strategic "one platform, many venues" view.
  const operators = {};
  for (const venue of venues) {
    if (!venue.operator) continue;
    const entry = operators[venue.operator] ??= { operator: venue.operator, venues: 0, venue_names: [], nations: new Set(), source_families: {}, readiness: {} };
    entry.venues += 1;
    entry.venue_names.push(venue.canonical_name);
    entry.nations.add(venue.nation);
    for (const source of calendarsByVenue.get(venue.venue_census_id) ?? []) {
      if (source.source_family) entry.source_families[source.source_family] = (entry.source_families[source.source_family] ?? 0) + 1;
      entry.readiness[source.acquisition_readiness] = (entry.readiness[source.acquisition_readiness] ?? 0) + 1;
    }
  }
  const operatorEstates = Object.values(operators)
    .map((entry) => ({ ...entry, nations: [...entry.nations].sort(), venue_names: entry.venue_names.sort() }))
    .filter((entry) => entry.venues > 1)
    .sort((a, b) => b.venues - a.venues || a.operator.localeCompare(b.operator));

  // Source-family estate — the national reuse opportunity view.
  const families = {};
  for (const source of calendars) {
    const key = familyLabel(source);
    const entry = families[key] ??= { source_family: key, sources: 0, venues: new Set(), event_domains: new Set(), readiness: {} };
    entry.sources += 1;
    entry.venues.add(source.venue_census_id);
    entry.event_domains.add(source.source_type);
    entry.readiness[source.acquisition_readiness] = (entry.readiness[source.acquisition_readiness] ?? 0) + 1;
  }
  const familyEstate = Object.values(families)
    .map((entry) => ({ ...entry, venues: entry.venues.size, event_domains: [...entry.event_domains].sort() }))
    .sort((a, b) => b.sources - a.sources || a.source_family.localeCompare(b.source_family));

  // Coverage matrix by venue class.
  const coverage = {};
  for (const venue of venues) {
    const entry = coverage[venue.venue_type] ??= { venue_type: venue.venue_type, venues: 0, capacity_review: 0, identity_review: 0, with_calendar: 0, with_official_url: 0 };
    entry.venues += 1;
    if (venue.inclusion_basis === "CAPACITY_REVIEW_REQUIRED") entry.capacity_review += 1;
    if (venue.identity_review) entry.identity_review += 1;
    if ((calendarsByVenue.get(venue.venue_census_id) ?? []).length) entry.with_calendar += 1;
    if (venue.official_url) entry.with_official_url += 1;
  }

  const priority = venues.map((venue) => ({
    venue: venue.canonical_name, city: venue.city, nation: venue.nation, venue_type: venue.venue_type,
    capacity: principalCapacity.get(venue.venue_census_id)?.capacity_value ?? null,
    sport: hasType(venue.venue_census_id, "SPORT_FIXTURES"),
    conference: hasType(venue.venue_census_id, "CONFERENCES") || hasType(venue.venue_census_id, "CONVENTIONS"),
    exhibition: hasType(venue.venue_census_id, "EXHIBITIONS") || hasType(venue.venue_census_id, "TRADE_SHOWS"),
    concerts: hasType(venue.venue_census_id, "CONCERTS"),
    official_calendars: (calendarsByVenue.get(venue.venue_census_id) ?? []).length,
    best_readiness: bestReadiness((calendarsByVenue.get(venue.venue_census_id) ?? []).map((source) => source.acquisition_readiness)),
  })).sort((a, b) => (b.capacity ?? -1) - (a.capacity ?? -1) || a.venue.localeCompare(b.venue));

  const summary = {
    artifact_type: "UK_MAJOR_EVENT_VENUE_CENSUS__SUMMARY",
    census_id: venuesDoc.census_id,
    generated_at: new Date().toISOString(),
    totals: {
      venues: venues.length,
      by_nation: tally(venues, (venue) => venue.nation),
      by_venue_type: tally(venues, (venue) => venue.venue_type),
      by_inclusion_basis: tally(venues, (venue) => venue.inclusion_basis),
      venues_with_any_calendar: calendarsByVenue.size,
      venues_without_any_calendar: venues.length - calendarsByVenue.size,
      identity_review: venues.filter((venue) => venue.identity_review).length,
    },
    calendars: {
      total: calendars.length,
      by_source_type: tally(calendars, (source) => source.source_type),
      by_sport: tally(calendars, (source) => source.sport),
      by_acquisition_readiness: tally(calendars, (source) => source.acquisition_readiness),
      by_source_family: tally(calendars, (source) => familyLabel(source)),
      first_party: calendars.filter((source) => source.first_party === true).length,
    },
    capacity: {
      by_authority: tally(capacity.filter((item) => item.is_principal), (item) => item.capacity_source_authority ?? "NO_AUTHORITY_RECORDED"),
      by_confidence: tally(capacity.filter((item) => item.is_principal), (item) => item.capacity_confidence),
      venues_with_multiple_configurations: new Set(capacity.filter((item) => !item.is_principal).map((item) => item.venue_census_id)).size,
    },
    venue_class_coverage: Object.values(coverage).sort((a, b) => b.venues - a.venues || a.venue_type.localeCompare(b.venue_type)),
    operator_estates: operatorEstates,
    source_family_estate: familyEstate,
    venues_by_nation_and_type: nationTypeMatrix(venues),
    priority_table: priority,
  };

  await writeJson(resolve(CENSUS_DIR, "census-summary.json"), summary);
  console.log(JSON.stringify({ totals: summary.totals, calendars: summary.calendars, capacity: summary.capacity }, null, 2));
}

function bestReadiness(values) {
  const order = ["READY_TIER1", "READY_WITH_CONFIGURATION", "TIER2_REUSABLE_FAMILY", "TIER3_BROWSER_OR_COMPLEX", "SOURCE_REVIEW_REQUIRED", "NO_PUBLIC_CALENDAR"];
  for (const candidate of order) if (values.includes(candidate)) return candidate;
  return "NO_PUBLIC_CALENDAR";
}

function nationTypeMatrix(venues) {
  const matrix = {};
  for (const venue of venues) {
    matrix[venue.nation] ??= {};
    matrix[venue.nation][venue.venue_type] = (matrix[venue.nation][venue.venue_type] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(matrix).sort(([a], [b]) => a.localeCompare(b))
    .map(([nation, types]) => [nation, Object.fromEntries(Object.entries(types).sort(([a], [b]) => a.localeCompare(b)))]));
}

/**
 * Phase 15: re-check every source whose family feeds the TIER2 headline
 * against that family's own structural claim, and conservatively downgrade
 * the ones the live page does not support. Turns an upper bound into a
 * measured number.
 */
async function auditFamilies(argv) {
  const concurrency = Number(argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] ?? 6);
  const path = resolve(CENSUS_DIR, "calendar-sources.json");
  const document = await readJson(path);

  const verdicts = await auditSourceFamilies(document.calendar_sources, {
    concurrency,
    onProgress: (done, total) => { if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`); },
  });

  const tally = {};
  const byFamily = {};
  for (const verdict of verdicts) {
    tally[verdict.verdict] = (tally[verdict.verdict] ?? 0) + 1;
    const family = (byFamily[verdict.source_family] ??= { CONFIRMED: 0, NOT_CONFIRMED: 0, UNREACHABLE: 0, NOT_VERIFIABLE: 0 });
    family[verdict.verdict] += 1;
  }

  // Readiness is a pure function of what the fingerprint engine detected,
  // so a prior audit downgrade can be undone from the retained fields
  // without re-fetching anything.
  const { sources, downgraded } = applyAuditVerdicts(document.calendar_sources, verdicts, {
    resetReadiness: (source) => readinessFromFingerprint({
      ok: typeof source.http_status === "number" && source.http_status >= 200 && source.http_status < 300,
      mechanism: source.source_family,
      collectorRoute: source.collector_route,
    }),
  });
  document.calendar_sources = sources;
  document.counts = { records: sources.length, ...countCalendars(sources) };
  await writeJson(path, document);

  await writeJson(resolve(CENSUS_DIR, "source-family-audit.json"), {
    artifact_type: "UK_MAJOR_EVENT_VENUE_CENSUS__SOURCE_FAMILY_AUDIT",
    generated_at: new Date().toISOString(),
    method: "Every source whose family feeds TIER2_REUSABLE_FAMILY was re-fetched once and checked against that family's own structural marker (e.g. __NEXT_DATA__ for EMBEDDED_NEXT_DATA; a substantive non-emoji application/json payload for OTHER_EMBEDDED_APP_STATE). Families that are already the conservative answer (CLIENT_RENDERED_UNKNOWN, ACCESS_BLOCKED) were not audited, since over-classifying into them costs nothing. The unmerged fingerprint fixes on PR #41 were NOT imported; this is an independent verifier.",
    audited: verdicts.length,
    downgraded_to_review: downgraded,
    by_verdict: tally,
    by_family: byFamily,
    verdicts: verdicts.sort((a, b) => String(a.calendar_source_id).localeCompare(String(b.calendar_source_id))),
  });

  console.log(`audited: ${verdicts.length}`);
  console.log(`by verdict: ${JSON.stringify(tally, null, 2)}`);
  console.log(`by family: ${JSON.stringify(byFamily, null, 2)}`);
  console.log(`downgraded to SOURCE_REVIEW_REQUIRED: ${downgraded}`);
}

/**
 * Phase 7: sweep every recorded official_url and classify it. Legitimacy is
 * never inferred from HTTP 200 — a URL is only called valid when the page
 * it serves actually identifies the venue.
 *
 * This step REPORTS. It does not rewrite venue records, because choosing a
 * replacement URL needs evidence about the venue's real identity, which is
 * research, not a status code.
 */
async function auditUrls(argv) {
  const concurrency = Number(argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] ?? 6);
  const venuesDoc = await readJson(resolve(CENSUS_DIR, "venues.json"));

  const results = await auditOfficialUrls(venuesDoc.venues, {
    concurrency,
    onProgress: (done, total) => { if (done % 50 === 0 || done === total) console.log(`  ${done}/${total}`); },
  });

  const tally = {};
  for (const result of results) tally[result.verdict] = (tally[result.verdict] ?? 0) + 1;
  const invalid = results.filter((result) => INVALID_URL_VERDICTS.has(result.verdict));

  await writeJson(resolve(CENSUS_DIR, "official-url-audit.json"), {
    artifact_type: "UK_MAJOR_EVENT_VENUE_CENSUS__OFFICIAL_URL_AUDIT",
    generated_at: new Date().toISOString(),
    method: "Every recorded official_url fetched once and classified against the venue it claims to belong to. Legitimacy is never inferred from HTTP 200: a URL is called valid only when the served page contains a distinctive token identifying the venue. Gambling/SEO markers condemn a page only when it ALSO fails to identify the venue, so a racecourse legitimately mentioning betting is not false-positived. A 403/429/5xx is REVIEW_REQUIRED rather than condemned, because a block is not disproof.",
    checked: results.length,
    by_verdict: Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    invalid_count: invalid.length,
    results: results.sort((a, b) => a.venue_census_id.localeCompare(b.venue_census_id)),
  });

  console.log(`checked: ${results.length}`);
  console.log(`by verdict: ${JSON.stringify(tally, null, 2)}`);
  console.log(`\nURLs that must not stand as current truth (${invalid.length}):`);
  for (const result of invalid) console.log(`  ${result.verdict.padEnd(18)} ${result.canonical_name} (${result.city}) -> ${result.official_url}`);
}

const [command, ...argv] = process.argv.slice(2);
if (command === "compile") await compile();
else if (command === "fingerprint") await fingerprint(argv);
else if (command === "audit-families") await auditFamilies(argv);
else if (command === "audit-urls") await auditUrls(argv);
else if (command === "summarise") await summarise();
else {
  console.error("usage: run-census.mjs <compile|fingerprint|audit-families|audit-urls|summarise>");
  process.exitCode = 1;
}
