import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = async (name) => JSON.parse(await readFile(resolve(HERE, name), "utf8"));
const [ledger, probes] = await Promise.all([readJson("acquisition-ledger.json"), readJson("probe-results.json")]);

const clusterNotes = {
  CLIENT_RENDERED_UNKNOWN: ["No generic endpoint has been established from the retained static/structural response.", "Controlled Level 3 browser observation to discover a stable public endpoint, followed by a reusable endpoint collector.", "HIGH"],
  JSON_LD_EVENT: ["The generic JSON-LD parser exists, but the retained records did not yield a valid future event sample.", "Revalidate programme horizon and date semantics; do not treat parser compatibility as proof of current events.", "LOW"],
  OTHER: ["Programme/source identity is not specific enough for a collector family.", "Resolve the actual first-party programme mechanism before engineering.", "MEDIUM"],
  OTHER_EMBEDDED_APP_STATE: ["Fingerprinting detects embedded application data, but there is no generic safe traversal/extraction contract.", "Add bounded embedded-state discovery with path evidence and configured field mapping.", "HIGH"],
  PUBLIC_GRAPHQL: ["A public GraphQL surface is detected, but no generic configured GraphQL collector family exists.", "Add allow-listed query/configuration support with bounded pagination and schema validation.", "MEDIUM"],
  SQUARESPACE_CALENDAR: ["Platform detection exists, but calendar/feed discovery is not reliable across observed variants.", "Add generic Squarespace event/feed discovery before falling back to HTML.", "MEDIUM"],
  STATIC_HTML_CARDS: ["Static programme cards are visible, but normalized field extraction is source-shaped.", "Add a declarative list/card/detail field-map capability with validation and contextual-date rules.", "MEDIUM"],
};

const unresolved = ledger.records.filter((record) => record.venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE" && record.next_action === "DETERMINISTIC_CONTINUE");
const clusters = [...unresolved.reduce((map, record) => {
  const list = map.get(record.technical_mechanism) ?? [];
  list.push(record);
  map.set(record.technical_mechanism, list);
  return map;
}, new Map())].map(([mechanism, records]) => {
  const [currentCode, missing, difficulty] = clusterNotes[mechanism] ?? ["No reusable family is proven.", "Investigate and define a reusable capability before implementation.", "UNKNOWN"];
  return {
    capability_or_problem: mechanism,
    venue_count: records.length,
    affected_venues: records.map((record) => record.canonical_name).sort(),
    representative_sources: records.map((record) => record.programme_url ?? record.official_url).filter(Boolean).slice(0, 5),
    current_code_capability: currentCode,
    missing_generic_behaviour: missing,
    estimated_implementation_difficulty: difficulty,
    expected_venue_unlock: records.length,
  };
}).sort((a, b) => b.venue_count - a.venue_count || a.capability_or_problem.localeCompare(b.capability_or_problem));

const aiQueue = ledger.records.filter((record) => record.ai_research_required).map((record) => ({
  candidate_id: record.candidate_id,
  venue: record.canonical_name,
  venue_likelihood: record.venue_likelihood,
  already_known: `Retained research supports ${record.venue_likelihood}; official/programme surface: ${record.programme_url ?? record.official_url ?? "unresolved"}.`,
  unresolved: record.technical_mechanism === "THIRD_PARTY_PROGRAMME_ONLY" ? "Resolve a current authoritative first-party programme." : record.technical_mechanism === "SOURCE_IDENTITY_UNRESOLVED" ? "Resolve canonical first-party identity and programme." : "Determine whether a current first-party future programme exists and expose its public acquisition path.",
  deterministic_checks_attempted: record.source_evidence,
  ai_worker_should_determine: "Official identity, authoritative programme URL, current future-event visibility, and the concrete public mechanism without promoting third-party evidence to first-party authority.",
  automatic_afterward: "Run the governed generic Level 1/2 programme probe, fingerprint the surface, test existing collectors, and route any remaining gap by capability family.",
}));

const hardResidue = ledger.records.filter((record) => ["RETRY_LATER", "AI_RESEARCH_REQUIRED"].includes(record.next_action) || ["SOCIAL_FIRST_PROGRAMME", "IMAGE_OR_POSTER_PROGRAMME", "ACCESS_BLOCKED", "THIRD_PARTY_PROGRAMME_ONLY", "SOURCE_IDENTITY_UNRESOLVED"].includes(record.technical_mechanism)).map((record) => ({
  venue: record.canonical_name,
  venue_likelihood: record.venue_likelihood,
  mechanism: record.technical_mechanism,
  next_action: record.next_action,
}));

const output = {
  artifact_type: "BERLIN_GENERIC_CAPABILITY_CLUSTERS",
  generated_at: new Date().toISOString(),
  unresolved_proven_venues_requiring_generic_capability: unresolved.length,
  clusters,
  generic_improvements_implemented: [
    { capability: "SELECTOR_FREE_SAME_ORIGIN_EVENT_LINK_DISCOVERY_PLUS_EXISTING_JSON_LD", affected_real_venues: 6, acquisition_proven_unlock: 6, venues: ["Hole⁴⁴", "Kreuzwerk", "Ritter Butzke", "RSO.Berlin", "Soda Club", "Terzo Mondo"] },
    { capability: "GENERIC_SCHEMA_ORG_EVENT_MICRODATA", affected_real_venues: 1, acquisition_proven_unlock: 1, venues: ["Loci Loft"] },
    { capability: "ISO_8601_BASIC_NUMERIC_OFFSET_NORMALIZATION", affected_real_venues: 1, acquisition_proven_unlock: 0, venues: ["b-flat (regression corpus; already canonically acquired)"], note: "Improves normalized datetime accuracy but adds no new Berlin acquisition-capable venue in this pass." },
  ],
  ai_research_queue: aiQueue,
  human_review_queue: [],
  human_review_note: "No remaining case was proven to require human judgement rather than deterministic engineering, retry, or AI-assisted public-source research. Coordinates remain out of scope.",
  hard_or_blocked_residue: hardResidue,
  browser_level_3: probes.browser_level_3,
  london_readiness: {
    inherited_generic_capabilities: [
      "Governed Level 1/2 source investigation with retained evidence and explicit escalation history",
      "Generic structural fingerprints and collector-fit routing from PR #15",
      "Existing JSON-LD, ICS/iCalendar, Events Calendar REST, HTML-link, and observation-normalization paths",
      "Selector-free same-origin event-detail discovery added in this work",
      "Schema.org Event/MusicEvent microdata acquisition added in this work",
    ],
    remaining_generic_blocker: "A durable controlled-browser/embedded-application endpoint-resolution worker is still needed for the dominant CLIENT_RENDERED_UNKNOWN and OTHER_EMBEDDED_APP_STATE residue.",
    berlin_evidence_for_blocker: {
      affected_unresolved_proven_venues: unresolved.filter((record) => ["CLIENT_RENDERED_UNKNOWN", "OTHER_EMBEDDED_APP_STATE"].includes(record.technical_mechanism)).length,
      controlled_browser_available_in_this_run: false,
    },
    recommendation: "ONE_MORE_GENERIC_BLOCKER_BEFORE_LONDON",
  },
};
await writeFile(resolve(HERE, "capability-clusters.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");

const eight = ["Hebbel am Ufer (HAU 1, 2, 3)", "Kreuzwerk", "American Western Saloon", "Musikbrauerei", "MS Hoppetosse", "Panke", "Maaya", "Golden Gate"];
const outcomes = eight.map((venue) => probes.results.find((result) => result.venue === venue)).filter(Boolean);
const readme = `# Berlin deep acquisition learning\n\nThis corpus composes PR #15's generic research framework with PR #14's governed Berlin triage evidence. It does not activate sources or venues and does not publish or deploy.\n\n## Coverage\n\n- PROVEN independent venues: ${ledger.counts.proven_independent_venues}\n- additional LIKELY venues: ${ledger.counts.likely_additional_independent_venues}\n- canonical acquired: ${ledger.counts.canonically_acquired}\n- acquisition-proven, not activated: ${ledger.counts.acquisition_proven_not_activated}\n- deterministic capability including canonical sources: ${ledger.counts.deterministic_acquisition_capability}\n- current acquisition coverage: ${ledger.counts.current_acquisition_coverage_percent}%\n- acquisition-proven coverage: ${ledger.counts.acquisition_proven_coverage_percent}%\n- official programmes resolved: ${ledger.counts.official_programmes_resolved}\n- future programmes proven: ${ledger.counts.future_programmes_proven}\n\n## Eight deterministic recovery cases\n\n${outcomes.map((result) => `- ${result.venue}: \`${result.acquisition_result}\``).join("\n")}\n\n## Structural learning\n\nSelector-free same-origin event-link discovery composed with the existing JSON-LD path unlocked six venues. A new generic schema.org microdata path unlocked Loci Loft. ISO basic numeric offsets are now normalized by the shared JSON-LD datetime adapter. Remaining resolved-source gaps are grouped in \`capability-clusters.json\`; browser-dependent endpoint discovery remains explicit because no controlled browser backend was available.\n\n## Artifacts\n\n- \`acquisition-ledger.json\`: authoritative 110-venue working ledger\n- \`probe-results.json\`: 67 governed Level 1/2 programme-probe outcomes\n- \`capability-clusters.json\`: deterministic engineering clusters plus AI/human/hard residue\n\nEvery acquisition-proven result cites a governed source investigation and an actual normalized event sample. Mere URL discovery is never counted as acquisition proof.\n`;
const readmeWithLondonReadiness = readme.replace(
  "\n## Artifacts",
  "\n## London readiness\n\nRecommendation: `ONE_MORE_GENERIC_BLOCKER_BEFORE_LONDON`. The framework, governance, fingerprints, and reusable collector paths transfer cleanly, but the dominant Berlin residue is embedded/client-rendered programme state. A durable controlled-browser endpoint-resolution worker should be proven before a large autonomous London trial.\n\n## Artifacts",
);
await writeFile(resolve(HERE, "README.md"), readmeWithLondonReadiness, "utf8");
console.log(JSON.stringify({ clusters: clusters.length, deterministic_gap_venues: unresolved.length, ai_queue: aiQueue.length, hard_residue: hardResidue.length }, null, 2));
