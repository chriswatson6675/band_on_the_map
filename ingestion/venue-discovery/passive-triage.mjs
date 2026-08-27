import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  POLICY_VERSION_V1_2,
  emptyFieldAssessmentV1_2,
  validateInvestigation,
} from "../source-investigation/contract.mjs";

const DEFAULT_MAX_BYTES = 384 * 1024;
const USER_AGENT = "BeatMapped-source-triage/1.0 (+https://github.com/chriswatson6675/band_on_the_map)";
const PROGRAMME_LINK_RE = /\b(event|events|veranstalt|programm|kalender|agenda|concert|konzert|termine|calendar|spielplan|schedule|what.?s on|tickets?)\b/i;

function parseArgs(argv) {
  const values = {};
  for (const arg of argv) {
    if (!arg.startsWith("--") || !arg.includes("=")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    values[key] = rest.join("=");
  }
  return values;
}

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function stripTags(value) {
  return value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeBasicEntities(value) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function extractPage(html, finalUrl) {
  const title = decodeBasicEntities(stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  const description = decodeBasicEntities((html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)/i)?.[1] ?? "").trim());
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeBasicEntities(match[1]), finalUrl).href;
      const text = decodeBasicEntities(stripTags(match[2]));
      links.push({ url, text });
    } catch {
      // An invalid public href is not useful triage evidence.
    }
  }
  return { title, description, links: links.slice(0, 300) };
}

function selectProgrammeLink(page, finalUrl) {
  const origin = new URL(finalUrl).origin;
  const candidates = page.links
    .filter(({ url, text }) => new URL(url).origin === origin && PROGRAMME_LINK_RE.test(`${text} ${url}`))
    .filter(({ url }) => url !== finalUrl && !/\.(?:jpg|jpeg|png|gif|webp|pdf)(?:\?|$)/i.test(url));
  return candidates[0]?.url ?? null;
}

function classifyCapture(capture) {
  const documents = capture.responses.filter((response) => response.body_prefix);
  const combined = documents.map((response) => response.body_prefix).join("\n");
  const lower = combined.toLowerCase();
  const statusCodes = capture.responses.map((response) => response.status);
  const blocked = statusCodes.some((status) => [401, 403, 429].includes(status));
  const hasJsonLdEvent = /application\/ld\+json/i.test(combined) && /["']@type["']\s*:\s*["']event["']/i.test(combined);
  const hasTribe = /tribe-events|wp-json\/tribe\/events|the-events-calendar/i.test(combined);
  const hasWordPress = /wp-content|wp-json|wordpress/i.test(combined);
  const hasIcs = /(?:href|url)[^>\n]*(?:\.ics\b|ical|webcal:)/i.test(combined);
  const hasNextData = /__NEXT_DATA__|\/_next\//i.test(combined);
  const hasNuxt = /__NUXT__|\/_nuxt\//i.test(combined);
  const hasSvelteKit = /data-sveltekit|\/_app\/immutable|__data\.json/i.test(combined);
  const hasWix = /wixstatic|wix-code|wix-events/i.test(combined);
  const hasFourvenues = /fourvenues/i.test(combined);
  const hasSquarespace = /static1\.squarespace|squarespace/i.test(combined);
  const hasWebflow = /webflow/i.test(combined);
  const futureDate = /\b(?:2026[-/.](?:0?9|1[0-2])[-/.]\d{1,2}|\d{1,2}[./-](?:0?9|1[0-2])[./-]2026|2027[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]2027)\b/.test(combined);
  const eventWords = /\b(event|veranstaltung|konzert|concert|gig|live|dj|line[- ]?up|programm|spielplan)\b/i.test(stripTags(combined));
  const fetchedProgrammePage = capture.responses.some((response) => response.role === "PROGRAMME_CANDIDATE" && response.ok);

  let acquisitionClass = "UNKNOWN";
  let mechanism = "NO_CURRENT_PROGRAMME_FOUND";
  let family = null;
  if (blocked) {
    mechanism = "ACCESS_BLOCKED";
  } else if (hasJsonLdEvent) {
    acquisitionClass = "JSON_LD_EVENT";
    mechanism = "JSON_LD_EVENT";
    family = "JSON_LD";
  } else if (hasTribe) {
    acquisitionClass = "KNOWN_CALENDAR_PLUGIN";
    mechanism = "WORDPRESS_TRIBE_API";
    family = "WORDPRESS_CALENDAR";
  } else if (hasIcs && hasSquarespace) {
    acquisitionClass = "ICS";
    mechanism = "SQUARESPACE_CALENDAR";
    family = "SQUARESPACE_ICS";
  } else if (hasIcs) {
    acquisitionClass = "ICS";
    mechanism = "ICS_OR_ICAL";
    family = "ICS_CALENDAR";
  } else if (hasFourvenues || hasWix) {
    acquisitionClass = "CLIENT_RENDERED";
    mechanism = "WIX_OR_FOURVENUES";
  } else if (hasSvelteKit) {
    acquisitionClass = "CLIENT_RENDERED";
    mechanism = "EMBEDDED_SVELTEKIT_DATA";
  } else if (hasNextData) {
    acquisitionClass = "CLIENT_RENDERED";
    mechanism = "EMBEDDED_NEXT_DATA";
  } else if (hasNuxt) {
    acquisitionClass = "CLIENT_RENDERED";
    mechanism = "EMBEDDED_NUXT_STATE";
  } else if (hasSquarespace) {
    acquisitionClass = "STATIC_HTML";
    mechanism = "SQUARESPACE_CALENDAR";
    family = "STATIC_EVENT_LIST";
  } else if (hasWebflow) {
    acquisitionClass = "STATIC_HTML";
    mechanism = "WEBFLOW";
    family = "STATIC_EVENT_LIST";
  } else if (hasWordPress) {
    acquisitionClass = "WORDPRESS";
    mechanism = "WORDPRESS_OTHER_API";
    family = "WORDPRESS_CALENDAR";
  } else if (fetchedProgrammePage || eventWords) {
    acquisitionClass = "STATIC_HTML";
    mechanism = fetchedProgrammePage ? "LIST_TO_DETAIL_HTML" : "STATIC_HTML_CARDS";
    family = "STATIC_EVENT_LIST";
  }

  const programmeState = blocked
    ? "PROGRAMME_EXISTS_BUT_TECHNICALLY_UNREADABLE"
    : futureDate && eventWords
      ? "FUTURE_PROGRAMME_PROVEN"
      : fetchedProgrammePage || eventWords
        ? "NEEDS_DEEPER_INVESTIGATION"
        : "NO_FIRST_PARTY_PROGRAMME_FOUND";

  const fit = blocked
    ? "CURRENTLY_BLOCKED"
    : family === "JSON_LD" || family === "ICS_CALENDAR" || family === "STATIC_EVENT_LIST" || family === "WORDPRESS_CALENDAR" || family === "SQUARESPACE_ICS"
      ? "CONFIGURATION_ONLY"
      : mechanism.startsWith("EMBEDDED_") || mechanism === "WIX_OR_FOURVENUES"
        ? "GENERIC_CAPABILITY_WIDENING"
        : "NEEDS_DEEPER_INVESTIGATION";

  return { acquisitionClass, mechanism, family, programmeState, fit, blocked, futureDate, eventWords, fetchedProgrammePage };
}

function redactCapturedSecrets(text) {
  let redactions = 0;
  const body = text.replace(/\b[ps]k\.[A-Za-z0-9._-]{20,}/gi, () => {
    redactions += 1;
    return "[REDACTED_MAPBOX_ACCESS_TOKEN]";
  });
  return { body, redactions };
}

async function fetchBounded(url, role, maxBytes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1" },
      redirect: "follow",
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    const chunks = [];
    let total = 0;
    let truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = maxBytes - total;
        if (remaining <= 0) {
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value.subarray(0, remaining));
        total += Math.min(value.byteLength, remaining);
        if (value.byteLength > remaining || total >= maxBytes) {
          truncated = true;
          await reader.cancel();
          break;
        }
      }
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const captured = redactCapturedSecrets(bytes.toString("utf8"));
    const bodyPrefix = captured.body;
    const retainedBytes = Buffer.from(bodyPrefix, "utf8");
    const contentType = response.headers.get("content-type") ?? null;
    const page = /html/i.test(contentType ?? "") ? extractPage(bodyPrefix, response.url) : { title: "", description: "", links: [] };
    return {
      role,
      requested_url: url,
      final_url: response.url,
      acquired_at: startedAt,
      status: response.status,
      ok: response.ok,
      content_type: contentType,
      content_length_header: response.headers.get("content-length"),
      body_prefix_bytes: retainedBytes.length,
      body_prefix_sha256: createHash("sha256").update(retainedBytes).digest("hex"),
      secret_redactions: captured.redactions,
      truncated,
      title: page.title,
      description: page.description,
      links: page.links,
      body_prefix: bodyPrefix,
    };
  } catch (error) {
    return { role, requested_url: url, final_url: null, acquired_at: startedAt, status: null, ok: false, error: error instanceof Error ? error.message : String(error), body_prefix: "", links: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function assessment(state, notes, evidenceRefs = ["ev-passive-static"]) {
  return { state, value: null, basis: null, derivation: null, notes, evidence_refs: evidenceRefs };
}

function buildInvestigation(candidate, capture, classification, investigationId, evidencePath) {
  const primary = capture.responses[0];
  const name = candidate.reported_names[0];
  const address = candidate.reported_addresses[0] ?? null;
  const successful = capture.responses.find((response) => response.ok);
  const titleMatches = successful?.title && slug(successful.title).includes(slug(name));
  const identityStatus = successful ? "PARTIAL" : "UNKNOWN";
  const probeOutcome = classification.blocked ? "BLOCKED" : classification.programmeState === "FUTURE_PROGRAMME_PROVEN" ? "SUFFICIENT" : "INSUFFICIENT";
  const fields = emptyFieldAssessmentV1_2();
  if (classification.eventWords) {
    fields.title = assessment("PARTIAL", "Event/programme language is present in the bounded first-party response, but no event parser or offline proof was created in this triage package.");
  }
  if (classification.futureDate) {
    fields.start_date = assessment("PARTIAL", "At least one explicit 2026/2027 future-date token is retained, but individual date semantics were not parsed or promoted to an event fact.");
  }
  fields.venue_location = assessment(address ? "PARTIAL" : "UNKNOWN", address ? `Discovery evidence reports ${address}; the passive page was not used to promote this to a canonical venue fact.` : "No address was established by this bounded probe.");

  const evidenceRef = "ev-passive-static";
  const investigation = {
    investigation_id: investigationId,
    policy_version: POLICY_VERSION_V1_2,
    investigated_at: primary.acquired_at,
    investigator: {
      type: "AI",
      method: "Bounded Level 1 PASSIVE_STATIC triage: one unauthenticated homepage GET and, when a same-origin programme-like link was directly exposed, one additional GET. Responses were capped, no retries, browser, authentication, challenge bypass, or state-changing request.",
    },
    probe_history: [{
      level: 1,
      method: "PASSIVE_STATIC",
      outcome: probeOutcome,
      reason: classification.blocked
        ? `The public request returned an access-limiting status; triage stopped without bypass or escalation.`
        : classification.programmeState === "FUTURE_PROGRAMME_PROVEN"
          ? `The bounded first-party response exposes programme language and an explicit future 2026/2027 date token, sufficient for triage classification but not activation.`
          : `The bounded static response did not prove a future programme; deeper structural work is deferred to a later candidate-specific package.`,
      evidence_refs: [evidenceRef],
    }],
    source_candidate_id: candidate.reconciled_candidate_id,
    source_id: null,
    venue_reference: address ? `${name} — ${address}` : `${name} — Berlin`,
    official_url: primary.requested_url,
    identity: {
      status: identityStatus,
      confidence: successful ? (titleMatches ? "MEDIUM" : "LOW") : "NONE",
      evidence_refs: successful ? [evidenceRef] : [],
      notes: successful
        ? `The discovery-supplied domain returned public content${titleMatches ? " whose title text matches the reported candidate name" : " but this bounded probe did not fully prove official identity"}.`
        : "The discovery-supplied URL did not return usable public content in the bounded probe.",
    },
    site_classification: {
      acquisition_class: classification.acquisitionClass,
      platform: `Deterministic Level-1 markers classified the apparent mechanism as ${classification.mechanism}.`,
      confidence: classification.acquisitionClass === "UNKNOWN" ? "NONE" : "MEDIUM",
      evidence_refs: classification.acquisitionClass === "UNKNOWN" ? [] : [evidenceRef],
    },
    data_paths: capture.programme_url ? [{
      kind: classification.mechanism,
      url: capture.programme_url,
      access: "PUBLIC",
      status: classification.programmeState === "FUTURE_PROGRAMME_PROVEN" ? "CONFIRMED" : "CANDIDATE",
      confidence: classification.programmeState === "FUTURE_PROGRAMME_PROVEN" ? "MEDIUM" : "LOW",
      evidence_refs: [evidenceRef],
    }] : [],
    field_assessment: fields,
    collector_assessment: {
      recommended_family: classification.family,
      confidence: classification.family ? "MEDIUM" : "NONE",
      evidence_refs: classification.family ? [evidenceRef] : [],
      blockers: classification.blocked ? [{ severity: "CRITICAL", description: "The bounded public request was access-blocked; no bypass was attempted." }] : [],
    },
    decision: {
      status: "DEFER",
      reasons: [
        "This is a comprehensive triage package, not an activation or collector-build package.",
        classification.programmeState === "FUTURE_PROGRAMME_PROVEN"
          ? "A future programme signal was found, but exact event fields and stable identity still require governed offline proof."
          : "A future first-party programme was not proven by the bounded Level-1 probe.",
      ],
      evidence_refs: [evidenceRef],
    },
    evidence: [{
      evidence_id: evidenceRef,
      evidence_class: "DIRECT_EVIDENCE",
      description: "Parsed, bounded passive HTTP capture containing response metadata, extracted links, and verbatim response-body prefixes; transformed/incomplete and therefore not byte-faithful.",
      acquired_from: primary.requested_url,
      acquired_at: primary.acquired_at,
      method: "Node fetch; descriptive User-Agent; unauthenticated GET; redirects followed; 15-second timeout; response bounded; no retry",
      content_type: "application/json",
      byte_faithful: false,
      path: evidencePath,
    }],
    supersedes: null,
  };
  const errors = validateInvestigation(investigation);
  if (errors.length) throw new Error(`${investigationId}: ${errors.join("; ")}`);
  return investigation;
}

async function probeCandidate(candidate, options) {
  const requestedUrl = candidate.reported_websites[0];
  const investigationId = `triage-${slug(candidate.reconciled_candidate_id.replace(/^reconciled-cand-/, ""))}-${slug(options.city)}-01`;
  const investigationDir = resolve(options.repoRoot, "research", "source-investigations", investigationId);
  const evidenceDir = join(investigationDir, "evidence");
  const evidencePath = `research/source-investigations/${investigationId}/evidence/passive-static.json`;
  const homepage = await fetchBounded(requestedUrl, "HOMEPAGE", options.maxBytes);
  const capture = { candidate_id: candidate.reconciled_candidate_id, reported_name: candidate.reported_names[0], requested_url: requestedUrl, programme_url: null, responses: [homepage] };
  if (homepage.ok && /html/i.test(homepage.content_type ?? "")) {
    const selected = selectProgrammeLink({ links: homepage.links }, homepage.final_url);
    if (selected) {
      capture.programme_url = selected;
      capture.responses.push(await fetchBounded(selected, "PROGRAMME_CANDIDATE", options.maxBytes));
    }
  }
  const classification = classifyCapture(capture);
  capture.classification = classification;
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(join(evidenceDir, "passive-static.json"), `${JSON.stringify(capture, null, 2)}\n`, "utf8");
  const investigation = buildInvestigation(candidate, capture, classification, investigationId, evidencePath);
  await writeFile(join(investigationDir, "investigation.json"), `${JSON.stringify(investigation, null, 2)}\n`, "utf8");
  await writeFile(join(investigationDir, "README.md"), `# ${candidate.reported_names[0]} — passive triage\n\nGenerated by the bounded venue-discovery Level-1 triage runner. The authoritative record is \`investigation.json\`. This preliminary investigation always defers activation.\n`, "utf8");
  return {
    candidate_id: candidate.reconciled_candidate_id,
    investigation_id: investigationId,
    reported_name: candidate.reported_names[0],
    requested_url: requestedUrl,
    final_url: homepage.final_url,
    http_status: homepage.status,
    title: homepage.title,
    programme_url: capture.programme_url,
    ...classification,
  };
}

export async function runPassiveTriage({ censusPath, outputPath, overridePath = null, candidateId = null, city, countryCode, concurrency = 4, maxBytes = DEFAULT_MAX_BYTES, repoRoot = process.cwd() }) {
  const census = JSON.parse(await readFile(resolve(repoRoot, censusPath), "utf8"));
  const newCandidates = census.candidates.filter((candidate) => candidate.existing_registry_reconciliation.status === "NEW_DISCOVERY_CANDIDATE");
  let candidates;
  if (overridePath) {
    const overrides = JSON.parse(await readFile(resolve(repoRoot, overridePath), "utf8"));
    candidates = overrides.map((override) => {
      const candidate = newCandidates.find((entry) => entry.reconciled_candidate_id === override.candidate_id);
      if (!candidate) throw new Error(`override candidate not found: ${override.candidate_id}`);
      return { ...candidate, reported_websites: [override.url] };
    });
  } else {
    candidates = newCandidates.filter((candidate) => candidate.reported_websites.length > 0);
  }
  if (candidateId) candidates = candidates.filter((candidate) => candidate.reconciled_candidate_id === candidateId);
  const results = new Array(candidates.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      results[index] = await probeCandidate(candidates[index], { city, countryCode, maxBytes, repoRoot });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  const artifact = {
    artifact_type: "BOUNDED_PASSIVE_TRIAGE_PROBES",
    city,
    country_code: countryCode,
    generated_at: new Date().toISOString(),
    policy_version: POLICY_VERSION_V1_2,
    input_census: censusPath.replace(/\\/g, "/"),
    input_overrides: overridePath?.replace(/\\/g, "/") ?? null,
    request_bound: "At most one homepage GET plus one directly linked same-origin programme-candidate GET per candidate; no retries or browser escalation.",
    candidates_probed: results.length,
    results,
  };
  const absoluteOutput = resolve(repoRoot, outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const required = ["census", "output", "city", "country"];
  for (const key of required) if (!args[key]) throw new Error(`--${key}=... is required`);
  const artifact = await runPassiveTriage({
    censusPath: args.census,
    outputPath: args.output,
    overridePath: args.overrides ?? null,
    candidateId: args.candidate ?? null,
    city: args.city,
    countryCode: args.country,
    concurrency: args.concurrency ? Number(args.concurrency) : 4,
    maxBytes: args["max-bytes"] ? Number(args["max-bytes"]) : DEFAULT_MAX_BYTES,
  });
  console.log(JSON.stringify({ candidates_probed: artifact.candidates_probed, output: args.output }, null, 2));
}
