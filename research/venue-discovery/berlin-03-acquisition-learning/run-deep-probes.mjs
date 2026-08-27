import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEventsPage, normalizeEventRecord } from "../../../ingestion/events-calendar-api/client.mjs";
import { toObservations as tribeToObservations } from "../../../ingestion/events-calendar-api/observation-adapter.mjs";
import { parseICS } from "../../../ingestion/ics/parse.mjs";
import { extractProgrammeLinks, proveJsonLdEvents } from "../../../ingestion/programme-acquisition/discovery.mjs";
import { fingerprintProgrammeSurface, routeCollectorCapability } from "../../../ingestion/venue-discovery/programme-fingerprint.mjs";
import { emptyFieldAssessmentV1_2, POLICY_VERSION_V1_2, validateInvestigation } from "../../../ingestion/source-investigation/contract.mjs";
import { redactSensitiveText } from "../../../ingestion/source-investigation/redact-sensitive-text.mjs";
import { buildLedger } from "./build-ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const USER_AGENT = "BeatMapped-deep-programme-probe/1.0 (+https://github.com/chriswatson6675/band_on_the_map)";
const MAX_BYTES = 512 * 1024;
const CUTOFF_DATE = "2026-08-27";

const slug = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110);
const assessment = (state, notes, evidenceRefs = []) => ({ state, value: null, basis: null, derivation: null, notes, evidence_refs: evidenceRefs });

function captureForEvidence(capture) {
  return { ...capture, body_sha256: createHash("sha256").update(capture.body).digest("hex") };
}

async function fetchBounded(url, role) {
  const acquiredAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/json,text/calendar;q=0.9,*/*;q=0.1" },
      redirect: "follow",
      signal: controller.signal,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const bounded = bytes.subarray(0, MAX_BYTES);
    return {
      role,
      requested_url: url,
      final_url: response.url,
      acquired_at: acquiredAt,
      status: response.status,
      ok: response.ok,
      content_type: response.headers.get("content-type"),
      truncated: bytes.length > bounded.length,
      body: redactSensitiveText(bounded.toString("utf8")),
      error: null,
    };
  } catch (error) {
    return { role, requested_url: url, final_url: null, acquired_at: acquiredAt, status: null, ok: false, content_type: null, truncated: false, body: "", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function extractIcsLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  for (const match of html.matchAll(/(?:href|data-href)=["']([^"']*(?:\.ics(?:[?#][^"']*)?|ical[^"']*))["']/gi)) {
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!seen.has(url)) { seen.add(url); links.push(url); }
    } catch { /* invalid retained href */ }
  }
  return links.slice(0, 4);
}

function futureIcsSamples(captures) {
  const samples = [];
  for (const capture of captures.filter((item) => /text\/calendar|BEGIN:VCALENDAR/i.test(`${item.content_type} ${item.body}`))) {
    try {
      const { events } = parseICS(capture.body);
      for (const event of events) {
        const date = event.dtstart?.iso?.slice(0, 10) ?? event.dtstart?.raw?.slice(0, 8)?.replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3") ?? null;
        if (!date || date < CUTOFF_DATE || !event.summary) continue;
        samples.push({ source_record_id: event.uid ?? event.url ?? capture.final_url, title: event.summary, start: event.dtstart, end: event.dtend, event_url: event.url ?? capture.final_url, location: event.location });
      }
    } catch { /* non-calendar links are not promoted */ }
  }
  return samples;
}

async function priorInvestigationByCandidate(candidateId) {
  const root = resolve(ROOT, "research/source-investigations");
  for (const name of await readdir(root)) {
    if (!name.startsWith("triage-") || !name.endsWith("-berlin-01")) continue;
    try {
      const record = JSON.parse(await readFile(join(root, name, "investigation.json"), "utf8"));
      if (record.source_candidate_id === candidateId) return record;
    } catch { /* not a candidate investigation directory */ }
  }
  return null;
}

function buildRecord(target, prior, investigationId, level1, proof, fingerprint, evidencePath, outcome) {
  const fields = emptyFieldAssessmentV1_2();
  const sample = proof.samples[0] ?? null;
  if (sample) {
    fields.title = { state: "PROVEN", value: sample.title, basis: "DIRECT_SOURCE", derivation: null, notes: "Reproduced by the existing deterministic collector path from retained first-party evidence.", evidence_refs: ["ev-level1", "ev-acquisition-proof"] };
    fields.start_date = { state: "PROVEN", value: sample.start_date, basis: "DIRECT_SOURCE", derivation: null, notes: "The retained source record directly exposes this date.", evidence_refs: ["ev-level1", "ev-acquisition-proof"] };
    fields.event_url = { state: "PROVEN", value: sample.event_url, basis: "DIRECT_SOURCE", derivation: null, notes: "The retained first-party programme/detail surface exposes this event URL.", evidence_refs: ["ev-level1", "ev-acquisition-proof"] };
    fields.source_record_id = assessment("PARTIAL", "The deterministic proof used the first-party event URL or source UID, but one acquisition does not independently establish long-term stability.", ["ev-acquisition-proof"]);
  }
  const evidence = [{
    evidence_id: "ev-level1", evidence_class: "DIRECT_EVIDENCE", description: "Bounded Level 1 public HTTP capture with response body, request metadata, and deterministic fingerprint; represented as JSON and therefore not byte-faithful.",
    acquired_from: level1[0].requested_url, acquired_at: level1[0].acquired_at, method: "Node fetch; unauthenticated GET; redirects followed; 20-second timeout; bounded response; no challenge bypass", content_type: "application/json", byte_faithful: false, path: evidencePath,
  }];
  if (sample) evidence.push({
    evidence_id: "ev-acquisition-proof", evidence_class: "DETERMINISTIC_DERIVATION", description: "Offline-compatible normalized event sample produced through an existing generic JSON-LD, ICS, or Tribe Events Calendar path.",
    acquired_from: level1[0].requested_url, acquired_at: level1[0].acquired_at, method: "Deterministic parser and Observation adapter over the retained Level 1/2 response", content_type: "application/json", byte_faithful: false, path: evidencePath.replace("level-1.json", "acquisition-proof.json"),
  });
  const blocked = level1.some((capture) => [401, 403, 429].includes(capture.status));
  const record = {
    investigation_id: investigationId,
    policy_version: POLICY_VERSION_V1_2,
    investigated_at: level1[0].acquired_at,
    investigator: { type: "AI", method: "Bounded read-only deep programme probe using generic first-party HTTP discovery and existing deterministic collector families." },
    probe_history: [{ level: 1, method: "PASSIVE_STATIC", outcome, reason: blocked ? "The public request was access-limited; probing stopped without bypass." : sample ? "The first-party response and directly exposed programme/detail links yielded normalized future events." : "The bounded first-party response did not yield normalized future events through an existing deterministic collector.", evidence_refs: ["ev-level1"] }],
    source_candidate_id: target.candidate_id,
    source_id: null,
    venue_reference: `${target.canonical_name} — Berlin`,
    official_url: target.official_url,
    identity: { status: prior?.identity?.status ?? "PARTIAL", confidence: prior?.identity?.confidence ?? "MEDIUM", evidence_refs: ["ev-level1"], notes: "The URL comes from the retained Berlin research estate and returned the captured public first-party surface." },
    site_classification: { acquisition_class: proof.acquisition_class, platform: `Generic fingerprint: ${fingerprint.mechanism}.`, confidence: fingerprint.mechanism === "OTHER" ? "LOW" : "MEDIUM", evidence_refs: ["ev-level1"] },
    data_paths: [{ kind: fingerprint.mechanism, url: target.programme_url ?? target.official_url, access: "PUBLIC", status: sample ? "CONFIRMED" : "CANDIDATE", confidence: sample ? "HIGH" : "MEDIUM", evidence_refs: ["ev-level1"] }],
    field_assessment: fields,
    collector_assessment: { recommended_family: proof.collector_family, confidence: sample ? "HIGH" : proof.collector_family ? "MEDIUM" : "NONE", evidence_refs: proof.collector_family ? ["ev-level1"] : [], blockers: blocked ? [{ severity: "CRITICAL", description: "Public acquisition is access-limited; no bypass was attempted." }] : [] },
    decision: { status: sample ? "READY_FOR_OFFLINE_PROOF" : "DEFER", reasons: [sample ? "Actual future events passed through an existing deterministic acquisition path; no source was activated." : "No normalized future event proof was established by this level."], evidence_refs: ["ev-level1", ...(sample ? ["ev-acquisition-proof"] : [])] },
    evidence,
    supersedes: prior?.investigation_id ?? null,
  };
  const errors = validateInvestigation(record);
  if (errors.length) throw new Error(`${investigationId}: ${errors.join("; ")}`);
  return record;
}

function proofFromJsonLd(captures, target) {
  const documents = captures.filter((capture) => capture.ok && /html/i.test(capture.content_type ?? "")).map((capture) => ({ url: capture.final_url, body: capture.body }));
  const proof = proveJsonLdEvents(documents, { sourceId: `research-${slug(target.candidate_id)}`, venueName: target.canonical_name, retrievedAt: captures[0].acquired_at, cutoffDate: CUTOFF_DATE });
  return proof.observations.map((observation) => ({ title: observation.title, start_date: observation.start.date, start: observation.start, event_url: observation.event_url, venue_name: observation.venue_name, source_record_id: observation.source_record_id }));
}

async function probeTarget(target) {
  const prior = await priorInvestigationByCandidate(target.candidate_id);
  const investigationId = `deep-${slug(target.candidate_id.replace(/^reconciled-cand-/, ""))}-berlin-02`;
  const investigationDir = resolve(ROOT, "research/source-investigations", investigationId);
  const evidenceDir = join(investigationDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });
  const programmeUrl = target.programme_url ?? target.official_url;
  const primary = await fetchBounded(programmeUrl, "PROGRAMME_OR_OFFICIAL");
  const captures = [primary];
  if (primary.ok && /html/i.test(primary.content_type ?? "")) {
    const links = extractProgrammeLinks(primary.body, { baseUrl: primary.final_url, limit: 4 });
    for (const link of links) captures.push(await fetchBounded(link.url, "EVENT_DETAIL"));
    for (const url of extractIcsLinks(primary.body, primary.final_url)) captures.push(await fetchBounded(url, "ICS"));
  }
  const fingerprint = fingerprintProgrammeSurface({ body: captures.map((capture) => capture.body).join("\n"), content_type: primary.content_type, status: primary.status, url: primary.final_url });
  let samples = proofFromJsonLd(captures, target);
  let acquisitionClass = samples.length ? "JSON_LD_EVENT" : "UNKNOWN";
  let family = samples.length ? "JSON_LD" : null;
  const icsSamples = futureIcsSamples(captures);
  if (!samples.length && icsSamples.length) {
    samples = icsSamples.map((sample) => ({ ...sample, start_date: sample.start.iso?.slice(0, 10) ?? sample.start.raw?.slice(0, 8)?.replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3") }));
    acquisitionClass = "ICS";
    family = "ICS_CALENDAR";
  }
  const proof = { samples: samples.slice(0, 5), acquisition_class: acquisitionClass, collector_family: family };
  const level1Evidence = { candidate_id: target.candidate_id, venue: target.canonical_name, programme_url: programmeUrl, captures: captures.map(captureForEvidence), fingerprint };
  const level1Path = `research/source-investigations/${investigationId}/evidence/level-1.json`;
  await writeFile(join(evidenceDir, "level-1.json"), `${JSON.stringify(level1Evidence, null, 2)}\n`, "utf8");
  if (samples.length) await writeFile(join(evidenceDir, "acquisition-proof.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  const blocked = captures.some((capture) => [401, 403, 429].includes(capture.status));
  const level1Outcome = blocked ? "BLOCKED" : samples.length ? "SUFFICIENT" : "INSUFFICIENT";
  let record = buildRecord(target, prior, investigationId, captures, proof, fingerprint, level1Path, level1Outcome);
  await writeFile(join(investigationDir, "investigation.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await writeFile(join(investigationDir, "README.md"), `# ${target.canonical_name} — deep programme probe\n\nThe authoritative state is \`investigation.json\`. Evidence was retained before each escalation. No source or venue was activated.\n`, "utf8");

  if (!blocked && !samples.length) {
    const structural = { inspected_at: new Date().toISOString(), prior_level: "INSUFFICIENT", fingerprint, attempted_endpoints: [], captures: [] };
    if (/WORDPRESS/i.test(fingerprint.detected_mechanisms.join(" "))) {
      const endpoint = new URL("/wp-json/tribe/events/v1/events/?per_page=10", primary.final_url).href;
      structural.attempted_endpoints.push(endpoint);
      const capture = await fetchBounded(endpoint, "WORDPRESS_TRIBE_API");
      structural.captures.push(captureForEvidence(capture));
      if (capture.ok) {
        try {
          const page = parseEventsPage(capture.body);
          const normalized = page.events.map(normalizeEventRecord);
          const observations = tribeToObservations(normalized, { source_id: `research-${slug(target.candidate_id)}` }, { retrievedAt: capture.acquired_at, sourceUrl: capture.final_url });
          samples = observations.filter((observation) => observation.title && observation.start.date >= CUTOFF_DATE).slice(0, 5).map((observation) => ({ title: observation.title, start_date: observation.start.date, start: observation.start, event_url: observation.event_url, venue_name: observation.venue_name, source_record_id: observation.source_record_id }));
          if (samples.length) { proof.samples = samples; proof.acquisition_class = "PUBLIC_JSON_API"; proof.collector_family = "WORDPRESS_CALENDAR"; }
        } catch (error) { structural.parse_error = error instanceof Error ? error.message : String(error); }
      }
    }
    const level2Path = `research/source-investigations/${investigationId}/evidence/level-2.json`;
    await writeFile(join(evidenceDir, "level-2.json"), `${JSON.stringify(structural, null, 2)}\n`, "utf8");
    if (samples.length) await writeFile(join(evidenceDir, "acquisition-proof.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
    record = buildRecord(target, prior, investigationId, captures, proof, fingerprint, level1Path, "INSUFFICIENT");
    record.probe_history.push({ level: 2, method: "STRUCTURAL", outcome: samples.length ? "SUFFICIENT" : "INSUFFICIENT", reason: samples.length ? "A public structured endpoint yielded normalized future events." : "Framework markers and known public structured endpoints did not yield normalized future events.", evidence_refs: ["ev-level2"] });
    record.evidence.push({ evidence_id: "ev-level2", evidence_class: "DIRECT_EVIDENCE", description: "Retained structural fingerprint and bounded public endpoint responses attempted only after Level 1 was insufficient.", acquired_from: programmeUrl, acquired_at: structural.inspected_at, method: "Deterministic public framework inspection and known public endpoint probe", content_type: "application/json", byte_faithful: false, path: level2Path });
    if (samples.length) {
      record.site_classification = { acquisition_class: proof.acquisition_class, platform: `Existing ${proof.collector_family} family.`, confidence: "HIGH", evidence_refs: ["ev-level2", "ev-acquisition-proof"] };
      record.collector_assessment = { recommended_family: proof.collector_family, confidence: "HIGH", evidence_refs: ["ev-level2", "ev-acquisition-proof"], blockers: [] };
      record.data_paths = [{ kind: fingerprint.mechanism, url: structural.attempted_endpoints[0], access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: ["ev-level2", "ev-acquisition-proof"] }];
      record.decision = { status: "READY_FOR_OFFLINE_PROOF", reasons: ["Actual future events passed through an existing deterministic acquisition path; no source was activated."], evidence_refs: ["ev-level2", "ev-acquisition-proof"] };
      const sample = samples[0];
      record.field_assessment.title = { state: "PROVEN", value: sample.title, basis: "DIRECT_SOURCE", derivation: null, notes: "Reproduced through the existing deterministic collector.", evidence_refs: ["ev-level2", "ev-acquisition-proof"] };
      record.field_assessment.start_date = { state: "PROVEN", value: sample.start_date, basis: "DIRECT_SOURCE", derivation: null, notes: "Directly exposed by the retained public API record.", evidence_refs: ["ev-level2", "ev-acquisition-proof"] };
      if (sample.event_url) record.field_assessment.event_url = { state: "PROVEN", value: sample.event_url, basis: "DIRECT_SOURCE", derivation: null, notes: "Directly exposed by the retained public API record.", evidence_refs: ["ev-level2", "ev-acquisition-proof"] };
    }
    const errors = validateInvestigation(record);
    if (errors.length) throw new Error(`${investigationId}: ${errors.join("; ")}`);
    await writeFile(join(investigationDir, "investigation.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  const hasProgrammeSignals = fingerprint.mechanism !== "NO_CURRENT_PROGRAMME_FOUND" && fingerprint.mechanism !== "ACCESS_BLOCKED";
  const acquisitionResult = samples.length ? "ACQUISITION_PROVEN_NOT_ACTIVATED" : blocked ? "TECHNICAL_FAILURE" : hasProgrammeSignals ? "SOURCE_RESOLVED_COLLECTOR_GAP" : primary.ok ? "NEEDS_DEEPER_INVESTIGATION" : "TECHNICAL_FAILURE";
  const provenMechanism = proof.collector_family === "WORDPRESS_CALENDAR"
    ? "WORDPRESS_TRIBE_API"
    : proof.acquisition_class === "ICS"
      ? "ICS_OR_ICAL"
      : proof.acquisition_class === "JSON_LD_EVENT"
        ? "JSON_LD_EVENT"
        : fingerprint.mechanism;
  return {
    candidate_id: target.candidate_id,
    venue: target.canonical_name,
    programme_url: programmeUrl,
    official_source_confidence: target.official_source_confidence,
    future_programme_state: samples.length ? "FUTURE_PROGRAMME_PROVEN" : target.future_programme_state,
    technical_mechanism: provenMechanism,
    collector_fit: samples.length ? routeCollectorCapability(provenMechanism) : routeCollectorCapability(fingerprint.mechanism),
    acquisition_result: acquisitionResult,
    generic_capability_dependency: samples.length ? null : fingerprint.mechanism,
    next_action: samples.length ? "NO_FURTHER_ACTION" : blocked || !primary.ok ? "RETRY_LATER" : acquisitionResult === "SOURCE_RESOLVED_COLLECTOR_GAP" ? "DETERMINISTIC_CONTINUE" : "AI_RESEARCH_REQUIRED",
    evidence_refs: [`research/source-investigations/${investigationId}/investigation.json`],
    read_only_proof: samples.length ? { collector_family: proof.collector_family, future_events_observed: samples.length, normalized_event_sample: samples.slice(0, 3), validation_failures: [] } : null,
    last_investigation_state: record.probe_history.at(-1).outcome,
  };
}

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; }));
const ledger = await buildLedger();
let targets = ledger.records.filter((record) => record.acquisition_result === "NOT_PROVEN" && record.official_url);
if (args.resolver === "DETERMINISTIC_CONTINUE") targets = targets.filter((record) => record.next_action === "DETERMINISTIC_CONTINUE");
if (args.candidate) targets = targets.filter((record) => record.candidate_id === args.candidate);
if (args.exclude) {
  const excluded = JSON.parse(await readFile(resolve(HERE, args.exclude), "utf8"));
  const ids = new Set(excluded.results.map((result) => result.candidate_id));
  targets = targets.filter((record) => !ids.has(record.candidate_id));
}
const results = [];
for (const target of targets) {
  console.log(`Probing ${target.canonical_name} (${target.programme_url ?? target.official_url})`);
  results.push(await probeTarget(target));
}
const artifact = { artifact_type: "BERLIN_DEEP_PROGRAMME_PROBE_RESULTS", generated_at: new Date().toISOString(), cutoff_date: CUTOFF_DATE, request_policy: "Bounded unauthenticated GET only; Level 2 only after retained Level 1 INSUFFICIENT; no browser, auth, CAPTCHA, or state change.", results };
await writeFile(resolve(HERE, args.output ?? "probe-results.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify(Object.fromEntries([...new Set(results.map((result) => result.acquisition_result))].map((value) => [value, results.filter((result) => result.acquisition_result === value).length])), null, 2));
