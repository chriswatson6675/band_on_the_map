import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const STATES = new Set([
  "NO_MEANINGFUL_CURRENT_EVIDENCE_FOUND", "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN",
  "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK", "CURRENT_MUSIC_VENUE_SOURCE_UNRESOLVED",
  "THIRD_PARTY_EVIDENCE_ONLY", "SOCIAL_FIRST_CURRENT_VENUE", "FIRST_PARTY_SITE_EXISTS_BUT_PROGRAMME_NOT_FOUND",
  "PROGRAMME_EXISTS_BUT_TECHNICALLY_UNREADABLE", "ACCESS_OR_DISCOVERY_LIMITATION", "LIKELY_CLOSED_OR_HISTORICAL",
  "LIKELY_IRRELEVANT_OR_NON_MATERIAL", "IDENTITY_PROBLEM_DISCOVERED", "INVESTIGATION_INCOMPLETE",
]);
const LIKELIHOODS = new Set([
  "PROVEN_CURRENT_MUSIC_VENUE", "LIKELY_CURRENT_MUSIC_VENUE", "PLAUSIBLE_MUSIC_VENUE",
  "CURRENT_PLACE_MUSIC_NOT_PROVEN", "LIKELY_NOT_MATERIAL_MUSIC", "LIKELY_CLOSED_OR_HISTORICAL", "UNKNOWN",
]);
const READINESS = new Set([
  "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "FIRST_PARTY_PROGRAMME_FOUND_NO_FUTURE_EVENTS_PROVEN",
  "THIRD_PARTY_PROGRAMME_ONLY", "SOCIAL_FIRST_PROGRAMME", "PROGRAMME_TECHNICALLY_UNREADABLE",
  "NO_PROGRAMME_FOUND", "SOURCE_IDENTITY_UNRESOLVED", "UNKNOWN",
]);

const proven = {
  "Hebbel am Ufer (HAU 1, 2, 3)": ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://www.hebbel-am-ufer.de/en/programme/schedule-tickets/", "First-party 2026 schedule exposes a Music category and named music/performance events at HAU rooms."],
  "RSO.Berlin": ["THIRD_PARTY_PROGRAMME_ONLY", "https://ra.co/clubs/178858", "Current 2026 RA listings and reporting identify the Schöneweide venue and named electronic-music lineups; the first-party programme surface remains unresolved."],
  Kreuzwerk: ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://kreuzwerk.club/events", "Current first-party events surface exposes dated 2026 club events and artist lineups."],
  "Bulbul Berlin": ["SOCIAL_FIRST_PROGRAMME", "https://www.bulbulberlin.de/", "First-party site identifies the current club and directs programme discovery to RA; a 2026 RA event exposes a named house lineup."],
  "M-BIA": ["THIRD_PARTY_PROGRAMME_ONLY", "https://www.berlin.de/tickets/suche/orte/m-bia-club-35bc1022-5e04-40c4-a9f5-516fa3155ba5/", "Berlin.de/Eventim exposes multiple future 2026 electronic events and named acts at the matching address."],
  ACUD: ["THIRD_PARTY_PROGRAMME_ONLY", "https://www.berlin.de/en/tickets/show/words-in-orbit-0d187af9-9a00-490f-a34b-6c415c7f0fab/", "Current municipal listings expose multiple future 2026 sound, live-electronics and ensemble events at ACUD."],
  "American Western Saloon": ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://www.western-saloon.de/veranstaltungen.html", "First-party 2026 programme states recurring live music and current dates; artist pages corroborate bookings."],
  "Wild at Heart": ["THIRD_PARTY_PROGRAMME_ONLY", "https://www.eventim.de/city/berlin-1/venue/wild-at-heart-berlin-1676/", "First-party booking page establishes an operating live-music club; ticketing pages expose named future 2026 concerts."],
  "Der Weiße Hase": ["THIRD_PARTY_PROGRAMME_ONLY", "https://berlin.ohschonhell.de/orte/der%2Bwei%C3%9Fe%2Bhase/446", "Multiple current programme indexes expose dense 2026 techno events and named DJ lineups at the matching RAW address."],
  Musikbrauerei: ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://musikbrauerei.com/events/", "First-party programme exposes multiple named future 2026 concerts across metal, classical and electronic music."],
  "Kit Kat Club": ["SOCIAL_FIRST_PROGRAMME", "https://t.me/s/kitkatberlin/947", "The official social channel and RA expose recurring 2026 events with named electronic artists; the legacy site was not an adequate acquisition surface."],
  "MS Hoppetosse": ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://hoppetosse.berlin/", "First-party programme and RA expose current and future 2026 electronic events with named lineups."],
  Panke: ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://www.pankeculture.com/programme/", "First-party programme exposes a dense 2026 calendar with live acts, DJs and named lineups."],
  Maaya: ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://maaya.de/", "First-party site exposes current dated music events and an official social/ticket hub exposes many 2026 concerts and parties."],
  "OXI Garten": ["THIRD_PARTY_PROGRAMME_ONLY", "https://ra.co/events/2466512", "Current 2026 listings expose named open-air and indoor electronic lineups, but Garten is a programme area of OXI rather than a separate universe addition."],
  "Golden Gate": ["FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", "https://goldengate-berlin.de/", "First-party site exposes current August 2026 events and named lineups at the Berlin venue."],
};

const likely = {
  "Prince Charles": ["THIRD_PARTY_PROGRAMME_ONLY", "https://ra.co/events/de/berlin?startDate=2026-07-30", "The official identity is live and current third-party listings show 2026 events, but the first-party events surface contains no inspectable programme."],
  Reset: ["THIRD_PARTY_PROGRAMME_ONLY", "https://www.berlin.de/tickets/suche/orte/reset-club-c8b9ec09-4297-4e9f-bf46-776df8412f73/", "Current municipal and venue-directory records describe a live-music club, but this pass did not expose a dated artist programme."],
  C115: ["SOURCE_IDENTITY_UNRESOLVED", null, "Multiple contemporary 2026 reports describe a newly opened electronic-music club at AVUS with DJ bookings, but no authoritative programme source was resolved."],
  "Zur Klappe": ["SOCIAL_FIRST_PROGRAMME", "https://zurklappe.org/", "The official site identifies a social-first programme and third-party history shows recent concerts; a future dated event was not visible in this pass."],
  "Heideglühen": ["SOCIAL_FIRST_PROGRAMME", "https://heidegluehen.berlin/aktuell/", "The official current page and contemporary community/event references indicate continuing 2026 club activity, but the programme surface is sparse."],
  Duncker: ["THIRD_PARTY_PROGRAMME_ONLY", "https://www.berlin.de/en/clubs/8871327-4469452-duncker.en.html", "The municipal club profile identifies an active programme of parties and concerts; the official programme was not cleanly machine-resolved."],
};

const plausible = {
  "Auster-Club": "Current venue/ticketing references associate the candidate with concerts, but no sufficiently current authoritative programme was resolved.",
  "Trompete": "The first-party site is established and a calendar surface was retained, but the bounded evidence did not prove a current material artist-led programme.",
  "Stella Berlin": "A current first-party identity was retained, but the musical programme and recurrence remain unproven.",
  "Vitrin": "Current directory evidence suggests an operating nightlife venue, but no artist-led programme was established.",
  "Tabula Rasa": "The official event-location identity is current and music events are plausible, but no recurring public artist programme was proven.",
  "spindler & klatt": "The current first-party calendar proves nightlife activity, but it is dominated by generic/theme parties rather than a material named-artist programme.",
};

const closed = {
  "Die Busche": ["https://www.berlin.de/clubs-und-party/clubguide/8871192-2857960-busche-club.html", "Berlin.de records permanent closure at the end of July 2025."],
  "Metrom Lounge": [null, "Only stale discovery identity was found; no credible contemporary venue or programme evidence surfaced."],
  "Kaffee Burger": ["https://www.gaesteliste030.de/de/berlin/locations/kaffee-burger", "Current directory record states permanent closure on 30 March 2019."],
  "RAW 99": [null, "The retained domain and second-pass search did not establish a current independent venue; available signals are historical RAW-Tempel material."],
  "Hangar 49": ["https://www.reddit.com/r/berlinsocialclub/comments/h0l1h0", "The only directly relevant retained public statement reports permanent closure; no contemporary programme or official identity was found."],
  "NBI Club": [null, "No credible contemporary programme or current independent club identity surfaced; discovery appears stale."],
};

const irrelevant = new Set([
  "AM to PM", "Hafenbar", "Sin City Tabledance", "808", "Arena Club", "Puro Sky Lounge Berlin", "teledisko",
  "Connection", "Orchidea", "Maxxim Club", "Alte Kantine", "Pussy Cat", "MiSalsa", "Butze (Kultur Klub Schulzendorf)",
  "Glashaus", "KTV Bar", "Cosmic Kaspar", "Ballhaus Berlin", "OC23",
]);
const identity = new Set([
  "Theater '89", "Jüdisches Theater", "Bühnen am Kürfürstendamm", "The Hub", "Prisma", "Nachtclub",
  "Internet Explorer", "Berndhain", "Pride Warehouse",
]);
const limited = new Set(["New West Club"]);

function proposed(likelihood, state) {
  if (likelihood === "PROVEN_CURRENT_MUSIC_VENUE") return "PROPOSED_CURRENT_MATERIAL_MUSIC_VENUE";
  if (likelihood === "LIKELY_CURRENT_MUSIC_VENUE") return "PROPOSED_LIKELY_CURRENT_MUSIC_VENUE";
  if (likelihood === "PLAUSIBLE_MUSIC_VENUE") return "PROPOSED_PLAUSIBLE_MUSIC_VENUE";
  if (state === "LIKELY_CLOSED_OR_HISTORICAL") return "PROPOSED_CLOSED_OR_HISTORICAL";
  if (state === "LIKELY_IRRELEVANT_OR_NON_MATERIAL") return "PROPOSED_CURRENT_VENUE_MUSIC_NOT_MATERIAL";
  if (state === "IDENTITY_PROBLEM_DISCOVERED") return "PROPOSED_IDENTITY_REVIEW";
  return "RETAIN_LOW_EVIDENCE_RESIDUE";
}

function makeRecord(candidate, search) {
  const name = candidate.reported_names[0];
  const isCultural = candidate.discovery_providers.includes("BERLIN_OPEN_DATA_CULTURAL_INSTITUTIONS");
  let evidence_state = isCultural ? "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN" : "NO_MEANINGFUL_CURRENT_EVIDENCE_FOUND";
  let venue_likelihood = isCultural ? "CURRENT_PLACE_MUSIC_NOT_PROVEN" : "UNKNOWN";
  let acquisition_readiness = "NO_PROGRAMME_FOUND";
  let official_website_candidate = candidate.official_url;
  let official_site_confidence = candidate.official_url ? candidate.official_site_confidence : "NONE";
  let programme_url = candidate.programme_url;
  let future_events_visible = false;
  let recent_past_events_visible = false;
  let evidenceSummary = isCultural
    ? "The municipal cultural-institution discovery record supports a current or historically significant performing-arts identity, but this pass did not establish a material BeatMapped music role."
    : "The OSM discovery record is the only durable identity signal; neither the first-pass evidence nor the bounded second-pass search established a current material music programme.";
  let musicEvidence = [];
  let thirdParty = [];
  let social = null;
  let mechanism = "NONE_RESOLVED";
  let limitation = search?.limitation ?? null;
  let best_next_resolver = "NO_FURTHER_ACTION_JUSTIFIED";
  let countsTowardUniverse = false;

  if (candidate.official_url && !isCultural) {
    evidence_state = "FIRST_PARTY_SITE_EXISTS_BUT_PROGRAMME_NOT_FOUND";
    venue_likelihood = "CURRENT_PLACE_MUSIC_NOT_PROVEN";
    evidenceSummary = "A plausible first-party identity was retained in the first pass, but no current material artist programme was found.";
    best_next_resolver = "AI_RESEARCH_AGENT_USEFUL";
  }
  if (proven[name]) {
    const [ready, url, summary] = proven[name];
    evidence_state = ready === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN" ? "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK"
      : ready === "SOCIAL_FIRST_PROGRAMME" ? "SOCIAL_FIRST_CURRENT_VENUE"
      : "CURRENT_MUSIC_VENUE_SOURCE_UNRESOLVED";
    venue_likelihood = "PROVEN_CURRENT_MUSIC_VENUE";
    acquisition_readiness = ready;
    if (ready === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN") official_website_candidate ||= url;
    if (ready === "SOCIAL_FIRST_PROGRAMME" && !official_website_candidate && !url.includes("t.me/")) official_website_candidate = url;
    official_site_confidence = candidate.official_url || ready === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN" ? "HIGH" : official_website_candidate ? "MEDIUM" : "NONE";
    programme_url = ready === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN" ? url : null;
    future_events_visible = true;
    recent_past_events_visible = true;
    evidenceSummary = summary;
    musicEvidence = [summary];
    thirdParty = ready === "THIRD_PARTY_PROGRAMME_ONLY" ? [url] : [];
    social = ready === "SOCIAL_FIRST_PROGRAMME" ? url : null;
    mechanism = ready === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN" ? "STATIC_OR_SERVER_RENDERED_EVENT_LIST" : ready;
    best_next_resolver = ready === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN" ? "DETERMINISTIC_CODE_CAN_CONTINUE" : "AI_RESEARCH_AGENT_USEFUL";
    countsTowardUniverse = name !== "OXI Garten";
  } else if (likely[name]) {
    const [ready, url, summary] = likely[name];
    evidence_state = ready === "SOCIAL_FIRST_PROGRAMME" ? "SOCIAL_FIRST_CURRENT_VENUE" : ready === "THIRD_PARTY_PROGRAMME_ONLY" ? "THIRD_PARTY_EVIDENCE_ONLY" : "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK";
    venue_likelihood = "LIKELY_CURRENT_MUSIC_VENUE";
    acquisition_readiness = ready;
    if (ready === "SOCIAL_FIRST_PROGRAMME" && !official_website_candidate) official_website_candidate = url;
    official_site_confidence = official_website_candidate ? "MEDIUM" : "NONE";
    programme_url = null;
    future_events_visible = ["Prince Charles", "Heideglühen"].includes(name);
    recent_past_events_visible = true;
    evidenceSummary = summary;
    musicEvidence = [summary];
    thirdParty = ready === "THIRD_PARTY_PROGRAMME_ONLY" ? [url] : [];
    social = ready === "SOCIAL_FIRST_PROGRAMME" ? url : null;
    mechanism = ready;
    best_next_resolver = "AI_RESEARCH_AGENT_USEFUL";
    countsTowardUniverse = true;
  } else if (plausible[name]) {
    evidence_state = candidate.official_url ? "FIRST_PARTY_SITE_EXISTS_BUT_PROGRAMME_NOT_FOUND" : "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK";
    venue_likelihood = "PLAUSIBLE_MUSIC_VENUE";
    acquisition_readiness = "NO_PROGRAMME_FOUND";
    evidenceSummary = plausible[name];
    musicEvidence = [plausible[name]];
    best_next_resolver = "AI_RESEARCH_AGENT_USEFUL";
  } else if (closed[name]) {
    const [url, summary] = closed[name];
    evidence_state = "LIKELY_CLOSED_OR_HISTORICAL";
    venue_likelihood = "LIKELY_CLOSED_OR_HISTORICAL";
    acquisition_readiness = "NO_PROGRAMME_FOUND";
    evidenceSummary = summary;
    thirdParty = url ? [url] : [];
    best_next_resolver = "NO_FURTHER_ACTION_JUSTIFIED";
  } else if (irrelevant.has(name)) {
    evidence_state = "LIKELY_IRRELEVANT_OR_NON_MATERIAL";
    venue_likelihood = "LIKELY_NOT_MATERIAL_MUSIC";
    acquisition_readiness = candidate.official_url ? "FIRST_PARTY_PROGRAMME_FOUND_NO_FUTURE_EVENTS_PROVEN" : "NO_PROGRAMME_FOUND";
    evidenceSummary = "Contemporary place or nightlife evidence exists, but the visible offer is primarily generic parties, hospitality, private hire, adult entertainment, karaoke, or non-music culture rather than a recurring identifiable-artist programme.";
    best_next_resolver = "NO_FURTHER_ACTION_JUSTIFIED";
  } else if (identity.has(name)) {
    evidence_state = "IDENTITY_PROBLEM_DISCOVERED";
    venue_likelihood = "UNKNOWN";
    acquisition_readiness = "SOURCE_IDENTITY_UNRESOLVED";
    evidenceSummary = "The reported name resolves ambiguously to a company, renamed venue, room, event concept, or generic label; an independent current venue identity is not established.";
    best_next_resolver = "HUMAN_JUDGEMENT_USEFUL";
  } else if (limited.has(name)) {
    evidence_state = "ACCESS_OR_DISCOVERY_LIMITATION";
    venue_likelihood = "UNKNOWN";
    acquisition_readiness = "PROGRAMME_TECHNICALLY_UNREADABLE";
    evidenceSummary = "A plausible current web identity exists, but access/rendering restrictions and the restricted search sweep prevented meaningful programme inspection.";
    best_next_resolver = "AI_RESEARCH_AGENT_USEFUL";
  }

  const currentPlaceEvidence = [
    `Discovery record from ${candidate.discovery_providers.join(", ")} (${candidate.discovery_categories.join(", ")}).`,
    ...(candidate.source_investigation_ref ? [`First-pass retained investigation: ${candidate.source_investigation_ref}.`] : []),
  ];
  const remainsUnknown = venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE"
    ? acquisition_readiness === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN" ? "Collector compatibility and governed source approval remain untested." : "A stable, authorised acquisition source remains unresolved."
    : venue_likelihood === "LIKELY_CURRENT_MUSIC_VENUE" ? "First-party continuity and a stable machine-readable programme remain unproven."
    : venue_likelihood === "PLAUSIBLE_MUSIC_VENUE" ? "Current recurrence, named-artist density, and a reliable programme source remain unproven."
    : evidence_state === "IDENTITY_PROBLEM_DISCOVERED" ? "The independent canonical venue identity and relationship to rooms/operators remain unresolved."
    : evidence_state === "LIKELY_CLOSED_OR_HISTORICAL" ? "No current successor identity was established."
    : "Current material artist-led music activity and a usable programme source remain unproven.";
  const whyFirstPassWasInconclusive = venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE"
    ? "The first pass required venue identity and a retained current programme to succeed together; the additional current programme, ticketing, municipal, or official-social evidence used here was not resolved in that pass."
    : venue_likelihood === "LIKELY_CURRENT_MUSIC_VENUE" || venue_likelihood === "PLAUSIBLE_MUSIC_VENUE"
      ? "The first pass did not resolve sufficiently current first-party programme evidence and therefore conservatively withheld venue status despite weaker contemporary music signals."
      : evidence_state === "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN" || evidence_state === "LIKELY_IRRELEVANT_OR_NON_MATERIAL"
        ? "The original discovery signal established a place or cultural/nightlife category, but not a material recurring identifiable-artist music programme."
        : evidence_state === "IDENTITY_PROBLEM_DISCOVERED"
          ? "The original pass could not safely map the discovery label to one independent current canonical venue identity."
          : evidence_state === "LIKELY_CLOSED_OR_HISTORICAL"
            ? "The discovery record was stale and the first pass did not yet retain sufficiently explicit closure or historical evidence."
            : "The original provider record was too weak to establish current identity and material music activity, and the bounded second-pass search added no credible contemporary evidence.";

  return {
    candidate_id: candidate.candidate_id,
    candidate_name: name,
    reported_names: candidate.reported_names,
    reported_addresses: candidate.reported_addresses,
    original_discovery_providers: candidate.discovery_providers,
    original_discovery_categories: candidate.discovery_categories,
    original_triage_status: candidate.primary_status,
    original_status_reason: candidate.status_reason,
    original_source_investigation_ref: candidate.source_investigation_ref,
    original_evidence_refs: candidate.evidence_refs,
    evidence_state,
    venue_likelihood,
    acquisition_readiness,
    current_place_evidence: currentPlaceEvidence,
    current_music_evidence: musicEvidence,
    official_website_candidate,
    official_site_confidence,
    official_social_presence: social,
    first_party_programme_url: programme_url,
    third_party_programme_or_event_evidence: thirdParty,
    future_events_visible,
    recent_past_events_visible,
    apparent_acquisition_mechanism: mechanism,
    research_access_limitation: limitation,
    evidence_summary: evidenceSummary,
    why_first_pass_was_inconclusive: whyFirstPassWasInconclusive,
    remains_unknown: remainsUnknown,
    proposed_second_pass_conclusion: proposed(venue_likelihood, evidence_state),
    best_next_resolver,
    counts_as_independent_universe_addition: countsTowardUniverse,
    second_pass_evidence_refs: [
      "research/venue-discovery/berlin-02-triage/evidence/insufficient-review-search.json",
      ...(candidate.evidence_refs ?? []),
      ...thirdParty,
      ...(programme_url ? [programme_url] : []),
    ].filter((value, index, values) => value && values.indexOf(value) === index),
  };
}

function countBy(records, field) {
  return Object.fromEntries([...new Set(records.map((record) => record[field]))].sort().map((value) => [value, records.filter((record) => record[field] === value).length]));
}

function pct(n, d) { return Number(((n / d) * 100).toFixed(1)); }

export async function build({ repoRoot = process.cwd() } = {}) {
  const triagePath = "research/venue-discovery/berlin-02-triage/triage.json";
  const searchPath = "research/venue-discovery/berlin-02-triage/evidence/insufficient-review-search.json";
  const triage = JSON.parse(await readFile(resolve(repoRoot, triagePath), "utf8"));
  const searchArtifact = JSON.parse(await readFile(resolve(repoRoot, searchPath), "utf8"));
  const candidates = triage.candidate_ledger.filter((candidate) => candidate.primary_status === "INSUFFICIENT_EVIDENCE");
  const searchById = new Map(searchArtifact.records.map((record) => [record.candidate_id, record]));
  const records = candidates.map((candidate) => makeRecord(candidate, searchById.get(candidate.candidate_id)));
  const ids = new Set(records.map((record) => record.candidate_id));
  if (records.length !== 100 || ids.size !== 100) throw new Error(`review cardinality invalid: records=${records.length}, ids=${ids.size}`);
  for (const record of records) {
    if (!STATES.has(record.evidence_state) || !LIKELIHOODS.has(record.venue_likelihood) || !READINESS.has(record.acquisition_readiness)) throw new Error(`invalid vocabulary for ${record.candidate_id}`);
    if (!record.evidence_summary || !record.remains_unknown || !record.current_place_evidence.length) throw new Error(`missing known/unknown evidence for ${record.candidate_id}`);
  }

  const recovered = records.filter((record) => ["PROVEN_CURRENT_MUSIC_VENUE", "LIKELY_CURRENT_MUSIC_VENUE"].includes(record.venue_likelihood));
  const plausibleResidue = records.filter((record) => record.venue_likelihood === "PLAUSIBLE_MUSIC_VENUE");
  const lowEvidence = records.filter((record) => record.evidence_state === "NO_MEANINGFUL_CURRENT_EVIDENCE_FOUND");
  const addedProven = records.filter((record) => record.venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE" && record.counts_as_independent_universe_addition).length;
  const addedLikely = records.filter((record) => record.venue_likelihood === "LIKELY_CURRENT_MUSIC_VENUE" && record.counts_as_independent_universe_addition).length;
  const originalUniverse = 89;
  const currentAcquired = 38;
  const conservativeUniverse = originalUniverse + addedProven;
  const broaderUniverse = conservativeUniverse + addedLikely;
  const sourceResolutionFailures = recovered.filter((record) => ["THIRD_PARTY_PROGRAMME_ONLY", "SOCIAL_FIRST_PROGRAMME", "SOURCE_IDENTITY_UNRESOLVED", "PROGRAMME_TECHNICALLY_UNREADABLE"].includes(record.acquisition_readiness)).length;
  const cleanFirstPartyAbsent = recovered.filter((record) => record.acquisition_readiness !== "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN").length;
  const researchFailureClusters = {
    no_current_evidence_after_bounded_research: lowEvidence.length,
    current_place_but_music_role_not_proven: records.filter((record) => record.evidence_state === "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN").length,
    clean_first_party_programme_absent_among_recovered: cleanFirstPartyAbsent,
    acquisition_or_source_resolution_failure_among_recovered: sourceResolutionFailures,
    social_first_programme: records.filter((record) => record.evidence_state === "SOCIAL_FIRST_CURRENT_VENUE").length,
    third_party_only_venue_evidence: records.filter((record) => record.evidence_state === "THIRD_PARTY_EVIDENCE_ONLY").length,
    programme_or_research_technically_limited: records.filter((record) => ["PROGRAMME_EXISTS_BUT_TECHNICALLY_UNREADABLE", "ACCESS_OR_DISCOVERY_LIMITATION"].includes(record.evidence_state)).length,
    closed_or_historical: records.filter((record) => record.evidence_state === "LIKELY_CLOSED_OR_HISTORICAL").length,
    irrelevant_or_non_material: records.filter((record) => record.evidence_state === "LIKELY_IRRELEVANT_OR_NON_MATERIAL").length,
    identity_rebrand_room_or_duplicate: records.filter((record) => record.evidence_state === "IDENTITY_PROBLEM_DISCOVERED").length,
  };
  const artifact = {
    artifact_type: "BERLIN_INSUFFICIENT_EVIDENCE_SECOND_PASS_REVIEW",
    policy_version: "v1.2",
    generated_at: new Date().toISOString(),
    input_triage: triagePath,
    original_triage_unchanged: true,
    scope: "Exactly the records whose original primary_status is INSUFFICIENT_EVIDENCE; proposed conclusions only, with zero activation.",
    evidence_boundary: "A bounded public search request was attempted once per candidate and retained. Search restrictions affected 98 requests. Material recoveries are based on cited public first-party, municipal, recognised ticketing, event-index, or official-social pages reviewed on 2026-08-27. Search snippets are discovery evidence and conclusions are AI_INTERPRETATION, not byte-faithful first-party captures.",
    reviewed_candidate_count: records.length,
    validation: { unique_candidate_ids: ids.size, all_have_evidence_state: true, all_have_venue_likelihood: true, all_have_acquisition_readiness: true, all_state_known_and_unknown: true },
    distributions: {
      evidence_state: countBy(records, "evidence_state"),
      venue_likelihood: countBy(records, "venue_likelihood"),
      acquisition_readiness: countBy(records, "acquisition_readiness"),
      best_next_resolver: countBy(records, "best_next_resolver"),
    },
    central_question_answers: {
      no_meaningful_current_evidence: lowEvidence.length,
      current_place_but_material_music_not_proven: records.filter((record) => record.evidence_state === "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN").length,
      plausible_current_music_venues: records.filter((record) => record.venue_likelihood === "PLAUSIBLE_MUSIC_VENUE").length,
      likely_current_music_venues: records.filter((record) => record.venue_likelihood === "LIKELY_CURRENT_MUSIC_VENUE").length,
      proven_current_music_venues: records.filter((record) => record.venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE").length,
      held_back_by_absent_clean_first_party_programme: cleanFirstPartyAbsent,
      held_back_by_acquisition_or_source_resolution: sourceResolutionFailures,
      actual_technical_or_access_limitation: researchFailureClusters.programme_or_research_technically_limited,
      closed_historical_irrelevant_or_identity_conflicted: researchFailureClusters.closed_or_historical + researchFailureClusters.irrelevant_or_non_material + researchFailureClusters.identity_rebrand_room_or_duplicate,
    },
    research_failure_clusters: researchFailureClusters,
    threshold_assessment: {
      conclusion: "MATERIALLY_OVER_CONSERVATIVE",
      reason: `${recovered.length} of 100 records now have proven or likely current material music status, including venues with visible future first-party programmes. The first pass correctly protected production data, but its joint venue-plus-source threshold hid venue status when acquisition resolution failed.`,
    },
    potential_venues_hidden_by_insufficient_evidence: recovered.map((record) => ({
      candidate_id: record.candidate_id, venue: record.candidate_name, venue_likelihood: record.venue_likelihood,
      evidence: record.evidence_summary, first_party_status: record.official_site_confidence,
      future_programme_status: record.acquisition_readiness, why_first_pass_did_not_admit: record.original_status_reason,
      next_automated_step: record.best_next_resolver === "DETERMINISTIC_CODE_CAN_CONTINUE" ? "Inspect the programme surface against existing generic adapters in a separate governed source investigation." : "Resolve and retain the authoritative programme path before any source proposal.",
      human_assistance_materially_helpful: record.best_next_resolver === "HUMAN_JUDGEMENT_USEFUL",
      counts_as_independent_universe_addition: record.counts_as_independent_universe_addition,
    })),
    plausible_but_still_unproven: plausibleResidue.map((record) => ({ candidate_id: record.candidate_id, venue: record.candidate_name, missing_evidence: record.remains_unknown, best_next_resolver: record.best_next_resolver })),
    true_low_evidence_residue: {
      count: lowEvidence.length,
      records: lowEvidence.map((record) => ({ candidate_id: record.candidate_id, venue: record.candidate_name, original_signal: `${record.original_discovery_providers.join(", ")}: ${record.original_discovery_categories.join(", ")}` })),
    },
    automation_lessons: [
      { priority: 1, capability: "MULTI_ENGINE_SEARCH_AND_ENTITY_RESOLUTION", effect: "Resolve ambiguous OSM names, aliases, rebrands and official domains while retaining provenance." },
      { priority: 2, capability: "RECOGNISED_EVENT_PLATFORM_RESOLUTION", effect: "Treat RA, Eventim, Berlin.de and comparable dated programme evidence as venue-status evidence independently of collector approval." },
      { priority: 3, capability: "SOCIAL_FIRST_PROGRAMME_DISCOVERY", effect: "Resolve official Linktree, Telegram and social event links without assuming a conventional website calendar." },
      { priority: 4, capability: "VENUE_STATUS_ACQUISITION_STATUS_SEPARATION", effect: "Prevent strong current-venue evidence from being discarded merely because an acquisition source is unresolved." },
      { priority: 5, capability: "CLOSURE_AND_ROOM_IDENTITY_DETECTION", effect: "Detect permanent closures and room/operator duplicates before programme probing." },
    ],
    universe_reassessment: {
      original_practical_regular_or_material_universe: originalUniverse,
      current_acquired_venues: currentAcquired,
      additional_proven_independent_venues: addedProven,
      additional_likely_independent_venues: addedLikely,
      proven_but_not_independent_additions: records.filter((record) => record.venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE" && !record.counts_as_independent_universe_addition).map((record) => record.candidate_name),
      revised_conservative_universe_proven_only: conservativeUniverse,
      revised_broader_working_universe_proven_plus_likely: broaderUniverse,
      acquisition_coverage_original_percent: pct(currentAcquired, originalUniverse),
      acquisition_coverage_conservative_percent: pct(currentAcquired, conservativeUniverse),
      acquisition_coverage_broader_percent: pct(currentAcquired, broaderUniverse),
      note: "Coverage holds the existing 38 acquired venues constant; no recovered candidate was activated.",
    },
    records,
  };

  const jsonPath = resolve(repoRoot, "research/venue-discovery/berlin-02-triage/insufficient-evidence-review.json");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const d = artifact.distributions;
  const hiddenRows = artifact.potential_venues_hidden_by_insufficient_evidence.map((item) => `| ${item.venue} | ${item.venue_likelihood} | ${item.future_programme_status} | ${item.next_automated_step} |`).join("\n");
  const plausibleRows = artifact.plausible_but_still_unproven.map((item) => `| ${item.venue} | ${item.missing_evidence} |`).join("\n");
  const md = `# Berlin insufficient-evidence review\n\nSecond-pass review of all **100** records classified \`INSUFFICIENT_EVIDENCE\` in the original Berlin triage. These are proposed conclusions only. The original triage remains unchanged; no source or venue was activated.\n\n## Result\n\nThe first-pass threshold was **${artifact.threshold_assessment.conclusion}**. It was safe for production, but it coupled venue proof to acquisition-source proof. The second pass finds **${d.venue_likelihood.PROVEN_CURRENT_MUSIC_VENUE ?? 0} proven**, **${d.venue_likelihood.LIKELY_CURRENT_MUSIC_VENUE ?? 0} likely**, and **${d.venue_likelihood.PLAUSIBLE_MUSIC_VENUE ?? 0} plausible** music venues among the 100.\n\nEvidence-state distribution:\n\n\`\`\`json\n${JSON.stringify(d.evidence_state, null, 2)}\n\`\`\`\n\nVenue-likelihood distribution:\n\n\`\`\`json\n${JSON.stringify(d.venue_likelihood, null, 2)}\n\`\`\`\n\nAcquisition-readiness distribution:\n\n\`\`\`json\n${JSON.stringify(d.acquisition_readiness, null, 2)}\n\`\`\`\n\n## Potential venues hidden by insufficient evidence\n\n| Venue | Likelihood | Programme/source state | Next step |\n|---|---|---|---|\n${hiddenRows}\n\n\`OXI Garten\` is proven as a current music programme area but is not counted as an independent universe addition because it is part of OXI.\n\n## Plausible but still unproven\n\n| Venue | Exact missing evidence |\n|---|---|\n${plausibleRows}\n\n## Low-evidence and noise residue\n\n**${artifact.true_low_evidence_residue.count}** records still have no meaningful contemporary evidence. Recurring noise patterns are generic or ambiguous OSM nightclub names, stale OSM records, hospitality/private-hire businesses, and municipal performing-arts records whose music role is not material to BeatMapped. The machine artifact identifies the original discovery signal for every low-evidence record.\n\n## Universe reassessment\n\n- Original practical universe: **${originalUniverse}**\n- Additional proven independent venues: **${addedProven}**\n- Additional likely independent venues: **${addedLikely}**\n- Revised conservative universe (proven only): **${conservativeUniverse}**; existing acquisition coverage **${pct(currentAcquired, conservativeUniverse)}%**\n- Revised broader universe (proven + likely): **${broaderUniverse}**; existing acquisition coverage **${pct(currentAcquired, broaderUniverse)}%**\n- Plausible candidates remain outside both denominators.\n\n## Automation lessons\n\nThe largest gains come from multi-engine entity resolution, recognised event-platform resolution, social-first programme discovery, explicit separation of venue status from acquisition readiness, and closure/room detection. Deterministic code can continue on first-party static programmes; AI research is useful for aliases, social-first and third-party-only cases; human judgement is reserved for genuine canonical-identity questions.\n\n## Evidence boundary\n\nA single bounded public search request was retained for every candidate; 98 were restricted by the search provider. No CAPTCHA, authentication, bot protection, or access control was bypassed. Material recoveries cite the public pages reviewed on 27 August 2026. The review conclusions are AI interpretation; they are not source activation decisions.\n`;
  await writeFile(resolve(repoRoot, "research/venue-discovery/berlin-02-triage/INSUFFICIENT_EVIDENCE_REVIEW.md"), md, "utf8");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"))) {
  const artifact = await build();
  console.log(JSON.stringify({ reviewed: artifact.reviewed_candidate_count, distributions: artifact.distributions, universe: artifact.universe_reassessment }, null, 2));
}
