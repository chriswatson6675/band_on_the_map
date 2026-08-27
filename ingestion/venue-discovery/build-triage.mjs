import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STATUS_VALUES = new Set([
  "CURRENT_REGULAR_MUSIC_VENUE",
  "CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE",
  "CURRENT_VENUE_MUSIC_NOT_MATERIAL",
  "CURRENT_NON_MUSIC_VENUE",
  "FESTIVAL_ONLY_OR_TEMPORARY",
  "CLOSED_OR_HISTORICAL",
  "DUPLICATE_OR_ROOM_OF_EXISTING_VENUE",
  "IDENTITY_UNCERTAIN",
  "INSUFFICIENT_EVIDENCE",
]);

const MUSIC_STATUSES = new Set(["CURRENT_REGULAR_MUSIC_VENUE", "CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE"]);

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
}

function normalise(value) {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleMatches(name, title) {
  const nameTokens = normalise(name).split(" ").filter((token) => token.length >= 3);
  const titleText = ` ${normalise(title)} `;
  return nameTokens.length > 0 && nameTokens.some((token) => titleText.includes(` ${token} `));
}

function distribution(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key] ?? "UNKNOWN"] = (counts[row[key] ?? "UNKNOWN"] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function classifyStatus(candidate, probe, config) {
  const override = config.status_overrides[candidate.reconciled_candidate_id];
  if (override) return { primary_status: override.status, status_reason: override.reason, classification_basis: "CURATED_EVIDENCE_INTERPRETATION" };
  const name = candidate.reported_names[0];
  if (config.existing_current_music_names.includes(name)) {
    return { primary_status: "CURRENT_REGULAR_MUSIC_VENUE", status_reason: "A prior governed source investigation establishes a current Berlin music-venue identity; acquisition remains separately classified.", classification_basis: "EXISTING_GOVERNED_INVESTIGATION" };
  }
  if (config.occasional_names.includes(name) && probe?.http_status === 200 && (probe.programme_url || probe.eventWords)) {
    return { primary_status: "CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE", status_reason: "The current first-party presence exposes a recurring music/event surface, but the venue is not primarily a dedicated music venue.", classification_basis: "PASSIVE_FIRST_PARTY_EVIDENCE" };
  }
  const category = candidate.observations.map((observation) => observation.reported_category).join(";");
  const musicCategory = /nightclub|music_venue|live_music=yes|concert_hall/i.test(category);
  if (probe?.http_status === 200 && musicCategory && (probe.programme_url || probe.programmeState === "FUTURE_PROGRAMME_PROVEN")) {
    return { primary_status: "CURRENT_REGULAR_MUSIC_VENUE", status_reason: "A current public first-party presence and programme/event surface corroborate the discovery provider's explicit music/nightclub signal.", classification_basis: "PASSIVE_FIRST_PARTY_PLUS_DISCOVERY_EVIDENCE" };
  }
  if (probe?.http_status === 200 && /restaurant|bar;live_music=yes/i.test(category) && (probe.programme_url || probe.eventWords)) {
    return { primary_status: "CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE", status_reason: "The current first-party presence corroborates a recurring music/event surface at a non-primary music venue.", classification_basis: "PASSIVE_FIRST_PARTY_PLUS_DISCOVERY_EVIDENCE" };
  }
  return { primary_status: "INSUFFICIENT_EVIDENCE", status_reason: "The retained evidence does not jointly prove current venue identity and material recurring live-music programming.", classification_basis: "CONSERVATIVE_DEFAULT" };
}

function readCaptureText(capture) {
  return capture?.responses?.map((response) => response.body_prefix ?? "").join("\n") ?? "";
}

function refineProgramme(probe, capture, existingInvestigationId) {
  const text = readCaptureText(capture);
  const futureNumeric = /\b(?:2026[-/.](?:0?9|1[0-2])[-/.]\d{1,2}|\d{1,2}[./-](?:0?9|1[0-2])[./-]2026|2027[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]2027)\b/.test(text);
  const futureContext = /\b(?:sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dez(?:ember)?|dec(?:ember)?)\s+2026\b|\b2026\s*\/\s*27\b|\b2027\b/i.test(text);
  const hasProgrammeWords = /\b(event|veranstaltung|konzert|concert|gig|live|dj|line[- ]?up|programm|spielplan|opera|oper|music|musik)\b/i.test(text.replace(/<[^>]+>/g, " "));
  if ((futureNumeric || futureContext) && hasProgrammeWords) return "FUTURE_PROGRAMME_PROVEN";
  if (probe?.blocked) return "PROGRAMME_EXISTS_BUT_TECHNICALLY_UNREADABLE";
  if (existingInvestigationId === "about-blank-berlin-01") return "PROGRAMME_EXISTS_BUT_TECHNICALLY_UNREADABLE";
  if (existingInvestigationId === "sisyphos-berlin-01") return "THIRD_PARTY_PROGRAMME_ONLY";
  if (existingInvestigationId === "suicide-club-berlin-01") return "NEEDS_DEEPER_INVESTIGATION";
  if (probe?.programme_url || probe?.eventWords) return "NEEDS_DEEPER_INVESTIGATION";
  return "NO_FIRST_PARTY_PROGRAMME_FOUND";
}

function refineMechanism(probe, capture, existingInvestigationId) {
  if (existingInvestigationId === "about-blank-berlin-01") return "IMAGE_OR_POSTER_PROGRAMME";
  if (existingInvestigationId === "sisyphos-berlin-01") return "SOCIAL_FIRST_PROGRAMME";
  if (existingInvestigationId === "suicide-club-berlin-01") return "CLIENT_RENDERED_UNKNOWN";
  if (!probe) return "NO_CURRENT_PROGRAMME_FOUND";
  if (probe.blocked) return "ACCESS_BLOCKED";
  const text = readCaptureText(capture);
  if (/(?:href|url)=["'][^"']*(?:\.ics(?:[?"']|$)|webcal:)/i.test(text)) return /kalender-eintrag|event[^"']*\.ics/i.test(text) ? "PER_EVENT_ICS" : "ICS_OR_ICAL";
  if (probe.mechanism === "JSON_LD_EVENT") return "JSON_LD_EVENT";
  if (probe.mechanism === "WORDPRESS_TRIBE_API") return "WORDPRESS_TRIBE_API";
  if (probe.mechanism === "SQUARESPACE_CALENDAR") return "SQUARESPACE_CALENDAR";
  if (probe.mechanism === "WIX_OR_FOURVENUES") return "WIX_OR_FOURVENUES";
  if (probe.mechanism.startsWith("EMBEDDED_")) return probe.mechanism;
  if (/itemscope[^>]+schema\.org\/Event|itemtype=["'][^"']*schema\.org\/Event/i.test(text)) return "MICRODATA";
  if (probe.programme_url) return "LIST_TO_DETAIL_HTML";
  if (probe.eventWords) return "STATIC_HTML_CARDS";
  return "NO_CURRENT_PROGRAMME_FOUND";
}

function collectorFit(mechanism, programmeStatus, isQuickWin) {
  if (isQuickWin) return "CONFIGURATION_ONLY";
  if (mechanism === "ACCESS_BLOCKED") return "CURRENTLY_BLOCKED";
  if (programmeStatus === "NO_FIRST_PARTY_PROGRAMME_FOUND" || programmeStatus === "NEEDS_DEEPER_INVESTIGATION" || programmeStatus === "THIRD_PARTY_PROGRAMME_ONLY") return "NEEDS_DEEPER_INVESTIGATION";
  if (["JSON_LD_EVENT", "WORDPRESS_TRIBE_API", "ICS_OR_ICAL", "PER_EVENT_ICS"].includes(mechanism)) return "CONFIGURATION_ONLY";
  if (["LIST_TO_DETAIL_HTML", "STATIC_HTML_CARDS", "MICRODATA", "SQUARESPACE_CALENDAR", "WIX_OR_FOURVENUES", "CLIENT_RENDERED_UNKNOWN", "EMBEDDED_NEXT_DATA", "EMBEDDED_NUXT_STATE", "EMBEDDED_SVELTEKIT_DATA"].includes(mechanism)) return "GENERIC_CAPABILITY_WIDENING";
  if (["IMAGE_OR_POSTER_PROGRAMME", "SOCIAL_FIRST_PROGRAMME"].includes(mechanism)) return "LIKELY_BESPOKE";
  return "NEEDS_DEEPER_INVESTIGATION";
}

function volumeSignals(capture) {
  if (!capture) return { visible_programme_signal_count: null, likely_programme_volume: "UNKNOWN" };
  const text = readCaptureText(capture);
  const links = new Set(capture.responses.flatMap((response) => response.links ?? []).filter(({ url, text: label }) => /event|veranstalt|konzert|concert|gig|programm|spielplan/i.test(`${url} ${label}`)).map(({ url }) => url));
  const dates = new Set([...text.matchAll(/\b(?:2026|2027)[-/.]\d{1,2}[-/.]\d{1,2}\b/g)].map((match) => match[0]));
  const count = Math.max(links.size, dates.size);
  const volume = count >= 40 ? "VERY_HIGH" : count >= 15 ? "HIGH" : count >= 5 ? "MEDIUM" : count >= 1 ? "LOW" : "UNKNOWN";
  return { visible_programme_signal_count: count, likely_programme_volume: volume };
}

function officialResolution(candidate, probe, existingInvestigation, seedIds) {
  if (existingInvestigation?.official_url) {
    return { canonical_name: candidate.reported_names[0], official_url: existingInvestigation.official_url, official_site_confidence: existingInvestigation.identity?.confidence ?? "MEDIUM", official_site_reason: "Reused from the cited governed source investigation." };
  }
  if (!probe || probe.http_status !== 200) return { canonical_name: null, official_url: null, official_site_confidence: "LOW", official_site_reason: "No usable current first-party response was retained." };
  const resolvedSeed = seedIds.has(candidate.reconciled_candidate_id);
  const matches = titleMatches(candidate.reported_names[0], probe.title);
  return {
    canonical_name: resolvedSeed || matches ? candidate.reported_names[0] : null,
    official_url: probe.final_url,
    official_site_confidence: resolvedSeed ? "HIGH" : matches ? "MEDIUM" : "LOW",
    official_site_reason: resolvedSeed ? "Current first-party result was manually resolved and then passively verified." : matches ? "The discovery-supplied domain returned a page title matching the candidate identity." : "The discovery-supplied domain responded, but its title did not sufficiently prove identity.",
  };
}

function makeIdentityReview(census) {
  const ids = [
    "reconciled-cand-beatmapped-source-bi-nuu-berlin",
    "reconciled-cand-osm-node-1667559178",
    "reconciled-cand-beatmapped-source-kater-blau-berlin",
    "reconciled-cand-osm-node-5247942730",
    "reconciled-cand-beatmapped-source-konzerthaus-berlin",
    "reconciled-cand-berlin-open-data-cultural-institutions-xlsx-row-33",
    "reconciled-cand-beatmapped-source-volksbuehne-berlin",
    "reconciled-cand-berlin-open-data-cultural-institutions-xlsx-row-3",
    "reconciled-cand-osm-node-1450635676",
  ];
  return ids.map((id) => {
    const candidate = census.candidates.find((entry) => entry.reconciled_candidate_id === id);
    const name = candidate?.reported_names[0] ?? id;
    let resolution = "CONFIRMED_EXISTING_MATCH";
    let reason;
    if (/bi-nuu|bi-nuu/i.test(id)) reason = "Exact reported name plus the retained Bi Nuu investigation's proven identity at Schlesisches Tor resolves the legacy-domain OSM node to the acquired Bi Nuu source/venue.";
    else if (/kater/i.test(id)) reason = "Exact reported name plus approximately 50-metre entrance-to-venue coordinate proximity and the governed Kater Blau → Kater identity/address evidence resolve the OSM node to the acquired source/venue.";
    else if (/konzerthaus|row-33/.test(id)) reason = "Exact Gendarmenmarkt address/postcode and retained first-party Konzerthaus identity resolve both records to the acquired venue.";
    else reason = id.includes("1450635676") ? "OSM explicitly reports Volksbühne as operator, while retained first-party evidence proves Roter Salon is an attached room." : "Exact Rosa-Luxemburg-Platz identity/address evidence resolves the record to the acquired Volksbühne venue cluster.";
    return { candidate_id: id, reported_name: name, resolution, reason };
  });
}

function humanQueue() {
  return [
    ["The Hub", "No official identity or website was resolved.", "Find a current sign, official profile, or exact address for the reported club.", "Verify the first-party domain and run a bounded passive probe."],
    ["West Germany", "A prior investigation could not establish a current programme.", "Confirm whether the Skalitzer Straße venue is still operating and identify its current official programme link.", "Create a superseding governed investigation if new first-party evidence is supplied."],
    ["Jugendschiff ReMiLi", "The supplied domain now contains unrelated sailing content.", "Confirm whether the Berlin youth ship still exists under another official name/domain.", "Resolve or reject the stale OSM identity with retained first-party evidence."],
    ["Parkdeck by Clärchen's", "The supplied URL points to Potsdam, conflicting with the Berlin candidate.", "Identify whether a Berlin Parkdeck venue exists and its exact official identity.", "Reconcile it as distinct, outside-city, or stale."],
    ["RSO.Berlin", "The first-party site is client-rendered and Level 1 did not expose a future programme.", "Provide the actual first-party events/tickets URL visible in a normal browser.", "Perform a policy-compliant Level 2 structural probe, retaining any public endpoint."],
    ["Lokschuppen", "The current rebrand is known, but the first-party programme failed in the bounded request.", "Confirm the current programme URL and whether it visibly lists future events.", "Create a superseding investigation and test the client-rendered data path."],
    ["Panke", "The official site is current but no future programme was proven.", "Find the site's actual current programme/calendar link.", "Probe that exact path and classify its acquisition mechanism."],
    ["OXI Garten", "The discovery-supplied site did not resolve and the relationship to OXI is unclear.", "Confirm whether OXI Garten is a separately programmed venue/room and provide its current official link.", "Reconcile the identity and investigate only the surviving first-party source."],
  ].map(([venue, uncertainty, founder_should_find, codex_afterward]) => ({ venue, uncertainty, founder_should_find, codex_afterward }));
}

export async function buildTriage({ censusPath, probePaths, configPath, outputPath, summaryPath, repoRoot = process.cwd() }) {
  const census = JSON.parse(await readFile(resolve(repoRoot, censusPath), "utf8"));
  const config = JSON.parse(await readFile(resolve(repoRoot, configPath), "utf8"));
  for (const override of Object.values(config.status_overrides)) if (!STATUS_VALUES.has(override.status)) throw new Error(`unknown status override: ${override.status}`);
  const probeArtifacts = await Promise.all(probePaths.map(async (path) => JSON.parse(await readFile(resolve(repoRoot, path), "utf8"))));
  const probeMap = new Map(probeArtifacts.flatMap((artifact) => artifact.results).map((result) => [result.candidate_id, result]));
  const captureMap = new Map();
  for (const probe of probeMap.values()) {
    const path = resolve(repoRoot, "research", "source-investigations", probe.investigation_id, "evidence", "passive-static.json");
    captureMap.set(probe.candidate_id, JSON.parse(await readFile(path, "utf8")));
  }
  const seedIds = new Set(JSON.parse(await readFile(resolve(repoRoot, "research/venue-discovery/berlin-02-triage/evidence/resolved-first-party-seeds.json"), "utf8")).map((entry) => entry.candidate_id));
  const newCandidates = census.candidates.filter((candidate) => candidate.existing_registry_reconciliation.status === "NEW_DISCOVERY_CANDIDATE");
  const ledger = [];
  for (const candidate of newCandidates) {
    const name = candidate.reported_names[0];
    const probe = probeMap.get(candidate.reconciled_candidate_id) ?? null;
    const capture = captureMap.get(candidate.reconciled_candidate_id) ?? null;
    const existingInvestigationId = config.existing_investigation_links[name] ?? null;
    const existingInvestigation = existingInvestigationId ? JSON.parse(await readFile(resolve(repoRoot, "research", "source-investigations", existingInvestigationId, "investigation.json"), "utf8")) : null;
    const status = classifyStatus(candidate, probe, config);
    const official = officialResolution(candidate, probe, existingInvestigation, seedIds);
    const futureProgrammeStatus = refineProgramme(probe, capture, existingInvestigationId);
    const technicalMechanism = refineMechanism(probe, capture, existingInvestigationId);
    const isQuickWin = config.quick_win_names.includes(name) && MUSIC_STATUSES.has(status.primary_status) && futureProgrammeStatus === "FUTURE_PROGRAMME_PROVEN";
    const fit = MUSIC_STATUSES.has(status.primary_status) ? collectorFit(technicalMechanism, futureProgrammeStatus, isQuickWin) : null;
    const volume = volumeSignals(capture);
    ledger.push({
      candidate_id: candidate.reconciled_candidate_id,
      reported_names: candidate.reported_names,
      reported_addresses: candidate.reported_addresses,
      discovery_providers: candidate.providers,
      discovery_categories: [...new Set(candidate.observations.map((observation) => observation.reported_category))],
      ...status,
      ...official,
      programme_url: config.programme_url_overrides?.[name] ?? probe?.programme_url ?? existingInvestigation?.data_paths?.find((path) => path.status === "CONFIRMED")?.url ?? null,
      future_programme_status: MUSIC_STATUSES.has(status.primary_status) ? futureProgrammeStatus : "NOT_APPLICABLE",
      technical_mechanism: MUSIC_STATUSES.has(status.primary_status) ? technicalMechanism : "NOT_APPLICABLE",
      collector_fit: fit,
      ...volume,
      source_investigation_ref: probe ? `research/source-investigations/${probe.investigation_id}/investigation.json` : existingInvestigationId ? `research/source-investigations/${existingInvestigationId}/investigation.json` : null,
      evidence_refs: [
        "research/venue-discovery/berlin-01/census.json",
        ...(probe ? [`research/source-investigations/${probe.investigation_id}/evidence/passive-static.json`] : []),
        ...(existingInvestigationId ? [`research/source-investigations/${existingInvestigationId}/investigation.json`] : []),
      ],
    });
  }
  if (ledger.length !== 181) throw new Error(`expected 181 NEW_DISCOVERY_CANDIDATE entries, got ${ledger.length}`);
  const ids = new Set(ledger.map((entry) => entry.candidate_id));
  if (ids.size !== ledger.length) throw new Error("triage ledger contains duplicate candidate ids");

  const musicLedger = ledger.filter((entry) => MUSIC_STATUSES.has(entry.primary_status));
  const quickWins = config.quick_win_names.map((name, index) => {
    const candidate = ledger.find((entry) => entry.reported_names[0] === name);
    if (!candidate) throw new Error(`quick win candidate not found: ${name}`);
    return { rank: index + 1, candidate_id: candidate.candidate_id, venue: name, programme_url: candidate.programme_url, technical_mechanism: candidate.technical_mechanism, collector_fit: candidate.collector_fit, likely_programme_volume: candidate.likely_programme_volume, reason: "Current first-party future programme plus an already-supported or configuration-level acquisition family." };
  });
  const multipliers = config.capability_multipliers.map((cluster, index) => ({
    rank: index + 1,
    capability: cluster.capability,
    candidate_venues: cluster.candidate_names,
    potentially_unlocked: cluster.candidate_names.length,
    representative_sources: cluster.candidate_names.slice(0, 3).map((name) => ledger.find((entry) => entry.reported_names[0] === name)?.programme_url).filter(Boolean),
    expected_difficulty: cluster.difficulty,
    implementation: cluster.implementation,
    reason: cluster.reason,
  }));
  const multiplierNames = new Set(multipliers.flatMap((cluster) => cluster.candidate_venues));
  const hardResidue = ledger.filter((entry) => ["IDENTITY_UNCERTAIN", "INSUFFICIENT_EVIDENCE", "CLOSED_OR_HISTORICAL"].includes(entry.primary_status) || (MUSIC_STATUSES.has(entry.primary_status) && !config.quick_win_names.includes(entry.reported_names[0]) && !multiplierNames.has(entry.reported_names[0]))).map((entry) => ({ candidate_id: entry.candidate_id, venue: entry.reported_names[0], primary_status: entry.primary_status, future_programme_status: entry.future_programme_status, technical_mechanism: entry.technical_mechanism, reason: entry.status_reason }));
  const currentNewMusic = musicLedger.length;
  const practicalUniverse = config.current_acquired_venues + currentNewMusic;
  const coverage = practicalUniverse === 0 ? 0 : Number(((config.current_acquired_venues / practicalUniverse) * 100).toFixed(1));
  const wave1 = config.current_acquired_venues + quickWins.length;
  const wave2Candidates = multipliers[0].candidate_venues.filter((name) => !config.quick_win_names.includes(name));
  const next50 = [
    { wave: 1, action: "Activate only after separate governed offline-proof/activation packages for the five configuration-level quick wins.", venues: quickWins.map((entry) => entry.venue), from: config.current_acquired_venues, to: wave1 },
    { wave: 2, action: "Build the generic declarative static event-list/detail capability, then investigate and activate its evidenced cohort separately.", venues: wave2Candidates, from: wave1, to: wave1 + wave2Candidates.length },
  ];
  const artifact = {
    artifact_type: "BERLIN_CANDIDATE_TRIAGE_LEDGER",
    census_type: "PRACTICAL_MULTISOURCE_DISCOVERY_CENSUS",
    city: "Berlin",
    country_code: "DE",
    as_of: config.as_of,
    completeness_claim: "All 181 NEW_DISCOVERY_CANDIDATE records are assigned exactly one status; classifications are bounded evidence-backed triage, not mathematical completeness, canonical identity, source activation, or event acquisition.",
    input: { census: censusPath, passive_probe_artifacts: probePaths, config: configPath },
    counts: {
      total_new_candidates_triaged: ledger.length,
      primary_status: distribution(ledger, "primary_status"),
      official_first_party_sites_resolved_high_or_medium: ledger.filter((entry) => ["HIGH", "MEDIUM"].includes(entry.official_site_confidence)).length,
      future_programmes_proven: musicLedger.filter((entry) => entry.future_programme_status === "FUTURE_PROGRAMME_PROVEN").length,
      technical_mechanism: distribution(musicLedger, "technical_mechanism"),
      collector_fit: distribution(musicLedger, "collector_fit"),
      current_acquired_venues: config.current_acquired_venues,
      practical_current_music_venue_universe: practicalUniverse,
      current_music_venues_not_acquired: currentNewMusic,
      acquisition_coverage_percentage: coverage,
      quick_wins: quickWins.length,
      capability_multiplier_unique_candidates: multiplierNames.size,
      hard_residue: hardResidue.length,
    },
    candidate_ledger: ledger,
    quick_wins: quickWins,
    capability_multipliers: multipliers,
    hard_residue: hardResidue,
    human_assistance_queue: humanQueue(),
    identity_review_resolutions: makeIdentityReview(census),
    next_50_plan: next50,
    maximum_coverage_strategy: [
      "Complete candidate-specific governed investigations and offline proof for configuration-level quick wins.",
      "Build the declarative static list/detail capability because the retained future-programme cohort is the largest evidence-backed multiplier.",
      "Widen WordPress and Squarespace event discovery next, retaining endpoint evidence per source.",
      "Resolve the focused human-assistance queue before spending engineering time on uncertain identities.",
      "Leave access-blocked, social-only, image-only, and genuinely ambiguous candidates deferred rather than forcing brittle collectors.",
    ],
  };
  await writeFile(resolve(repoRoot, outputPath), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const summary = `# Berlin 181-candidate triage\n\nThis is a bounded acquisition-backlog census, not activation. All **181** new discovery candidates have exactly one status. No source, venue, collector, mapping, or publication artifact is changed.\n\n## Counts\n\n- Current regular music venues: ${artifact.counts.primary_status.CURRENT_REGULAR_MUSIC_VENUE ?? 0}\n- Current occasional but material music venues: ${artifact.counts.primary_status.CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE ?? 0}\n- Closed/historical: ${artifact.counts.primary_status.CLOSED_OR_HISTORICAL ?? 0}\n- Duplicate/room: ${artifact.counts.primary_status.DUPLICATE_OR_ROOM_OF_EXISTING_VENUE ?? 0}\n- Music not material/non-music: ${(artifact.counts.primary_status.CURRENT_VENUE_MUSIC_NOT_MATERIAL ?? 0) + (artifact.counts.primary_status.CURRENT_NON_MUSIC_VENUE ?? 0)}\n- Identity uncertain/insufficient: ${(artifact.counts.primary_status.IDENTITY_UNCERTAIN ?? 0) + (artifact.counts.primary_status.INSUFFICIENT_EVIDENCE ?? 0)}\n- First-party sites resolved HIGH/MEDIUM: ${artifact.counts.official_first_party_sites_resolved_high_or_medium}\n- Future programmes proven: ${artifact.counts.future_programmes_proven}\n\n## Coverage\n\nThe practical evidence-backed universe is **${artifact.counts.practical_current_music_venue_universe}** venues: ${artifact.counts.current_acquired_venues} already acquired plus ${artifact.counts.current_music_venues_not_acquired} current regular/material candidates. Acquisition coverage is **${artifact.counts.acquisition_coverage_percentage}%**. Coordinates are not part of this calculation.\n\n## Route to 50\n\nWave 1 is the five configuration-level quick wins (${config.current_acquired_venues} → ${wave1}). Wave 2 is the eight-candidate declarative static list/detail cohort (${wave1} → ${wave1 + wave2Candidates.length}). This is a planning projection only; every activation remains a separate authorized package.\n\n## Volume criteria\n\nProgramme volume uses the maximum of distinct retained event-like links and explicit full future-date tokens: VERY_HIGH ≥40, HIGH ≥15, MEDIUM ≥5, LOW ≥1, otherwise UNKNOWN. It is a visible-signal band, never a fabricated event count.\n`;
  const details = `
## Evidence boundary

The triage used the retained Berlin discovery census, earlier governed investigations, and bounded passive Level 1 probes for candidates with a reported or manually resolved first-party site. Each probe used at most the homepage plus one directly linked, same-origin programme-like page. No login, bypass, browser escalation, or hidden-endpoint guessing was used. \`triage.json\` is authoritative and cites candidate-level evidence. Low-confidence identities remain unresolved rather than inferred.

## Ranked quick wins

${quickWins.map((entry) => `${entry.rank}. **${entry.venue}** — ${entry.technical_mechanism}, ${entry.collector_fit}, ${entry.likely_programme_volume} visible-signal volume.`).join("\n")}

These are acquisition opportunities only. Each still requires a separately authorised governed investigation, offline proof, registry change, and activation.

## Ranked capability multipliers

${multipliers.map((entry) => `${entry.rank}. **${entry.capability}** — ${entry.potentially_unlocked} candidates, ${entry.expected_difficulty}: ${entry.candidate_venues.join(", ")}.`).join("\n")}

## Human-assistance queue

${artifact.human_assistance_queue.map((entry) => `- **${entry.venue}:** ${entry.uncertainty} Founder: ${entry.founder_should_find} Codex afterward: ${entry.codex_afterward}`).join("\n")}

The machine-readable queue in \`triage.json\` records the uncertainty, the exact Founder input needed, and Codex's next action for each item.
`;
  await writeFile(resolve(repoRoot, summaryPath), `${summary}${details}`, "utf8");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  for (const key of ["census", "probes", "config", "output", "summary"]) if (!args[key]) throw new Error(`--${key}=... is required`);
  const artifact = await buildTriage({ censusPath: args.census, probePaths: args.probes.split(","), configPath: args.config, outputPath: args.output, summaryPath: args.summary });
  console.log(JSON.stringify(artifact.counts, null, 2));
}
