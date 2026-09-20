// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-COMPLETENESS-02 — Phase 15.
//
// The first census reported TIER2_REUSABLE_FAMILY as an UPPER BOUND, not a
// count: a 14-source spot audit found that roughly half of the largest
// family (OTHER_EMBEDDED_APP_STATE) did not actually carry reusable
// embedded application state. A page whose only `application/json` script
// is the WordPress emoji settings block is not a reusable data surface,
// but it fingerprinted as though it were.
//
// This module converts that upper bound into a MEASURED number by
// re-checking every source in the families that feed TIER2, against the
// family's OWN structural claim.
//
// It deliberately does NOT import the unmerged fingerprint fixes on PR #41.
// It is an independent, conservative verifier: where a family's claim
// cannot be confirmed from the live page, the source is downgraded to
// SOURCE_REVIEW_REQUIRED, because an honest "needs review" is worth more
// than false Tier-2 confidence.
//
// Strictly bounded and read-only: one GET per source, fixed concurrency,
// per-request timeout, no retries. It acquires NO events.

import { fetchText } from "../http/fetch.mjs";

/**
 * The families whose classification, if wrong, inflates the reusable-family
 * headline. CLIENT_RENDERED_UNKNOWN and ACCESS_BLOCKED are deliberately
 * excluded: they are already the conservative answer, so over-classifying
 * INTO them costs nothing.
 */
export const TIER2_CONTRIBUTING_FAMILIES = new Set([
  "OTHER_EMBEDDED_APP_STATE",
  "EMBEDDED_NEXT_DATA",
  "EMBEDDED_NUXT_STATE",
  "EMBEDDED_SVELTEKIT_DATA",
  "MICRODATA",
  "SQUARESPACE_CALENDAR",
  "WEBFLOW",
  "PUBLIC_GRAPHQL",
  // The READY_TIER1 families. These matter MOST: they are the sources a
  // first acquisition wave would start from, on the claim that an existing
  // collector already applies with no new engineering. A wrong
  // classification here sends the first wave at pages that cannot be
  // collected, so they are verified rather than trusted.
  "JSON_LD_EVENT",
  "WORDPRESS_TRIBE_API",
  // READY_WITH_CONFIGURATION. The configuration-only route presumes
  // server-rendered dated content actually exists on the page.
  "STATIC_HTML_CARDS",
]);

/**
 * The WordPress emoji settings block is emitted by default on virtually
 * every WordPress page and carries no programme data whatsoever. It was
 * the single biggest cause of false OTHER_EMBEDDED_APP_STATE claims.
 */
const WP_EMOJI_MARKERS = [/wp-emoji/i, /concatemoji/i, /_wpemojiSettings/i];

/** Extract the bodies of every embedded JSON-ish script on the page. */
function embeddedJsonScripts(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const attributes = match[1] ?? "";
    if (!/type\s*=\s*["']?(application\/(ld\+)?json|application\/x-[\w-]+)["']?/i.test(attributes)) continue;
    scripts.push({ attributes, body: match[2] ?? "" });
  }
  return scripts;
}

/** True when a script body is substantive rather than a boilerplate stub. */
function isSubstantiveJson(body) {
  const trimmed = String(body).trim();
  if (trimmed.length < 120) return false;
  if (WP_EMOJI_MARKERS.some((marker) => marker.test(trimmed))) return false;
  return /[[{]/.test(trimmed);
}

/**
 * Verify a family's OWN structural claim against the live page. Each rule
 * checks the specific marker the family name asserts — not merely "some
 * JSON exists somewhere", which is what let the emoji block through.
 */
export function verifyFamilyClaim(family, html) {
  const text = String(html ?? "");
  const scripts = embeddedJsonScripts(text);
  const substantive = scripts.filter((script) => isSubstantiveJson(script.body));

  switch (family) {
    case "EMBEDDED_NEXT_DATA": {
      // Next.js has TWO embedded-payload shapes and the audit must accept
      // both. The Pages Router emits `__NEXT_DATA__`; the App Router
      // replaced it with streamed RSC flight chunks pushed onto
      // `self.__next_f`. An earlier version of this rule checked only
      // __NEXT_DATA__ and reported 71 of 80 genuine Next.js sources as
      // misclassified — which would have UNDER-stated readiness just as
      // badly as the over-classification this audit exists to catch.
      //
      // `/_next/static` alone is deliberately NOT accepted: it proves the
      // framework built the page, not that data is embedded in it.
      const pagesRouter = /id\s*=\s*["']__NEXT_DATA__["']/.test(text);
      const appRouter = /self\.__next_f/.test(text);
      return {
        confirmed: pagesRouter || appRouter,
        detail: pagesRouter ? "__NEXT_DATA__ script (Pages Router)" : appRouter ? "self.__next_f RSC payload (App Router)" : "neither __NEXT_DATA__ nor self.__next_f present",
      };
    }
    case "EMBEDDED_NUXT_STATE":
      return { confirmed: /window\.__NUXT__/.test(text) || /id\s*=\s*["']__NUXT_DATA__["']/.test(text), detail: "__NUXT__ payload" };
    case "EMBEDDED_SVELTEKIT_DATA":
      return { confirmed: /__sveltekit_/.test(text) || /data-sveltekit/.test(text), detail: "SvelteKit hydration payload" };
    case "SQUARESPACE_CALENDAR":
      return { confirmed: /static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/.test(text), detail: "Squarespace context" };
    case "WEBFLOW":
      return { confirmed: /\.webflow\.|data-wf-page|data-wf-site/.test(text), detail: "Webflow site markers" };
    case "MICRODATA":
      return { confirmed: /itemtype\s*=\s*["']https?:\/\/schema\.org\/(Event|[A-Za-z]*Event)["']/i.test(text), detail: "schema.org Event microdata" };
    case "PUBLIC_GRAPHQL":
      return { confirmed: /graphql/i.test(text), detail: "GraphQL endpoint reference" };
    case "JSON_LD_EVENT": {
      // The claim is a JSON-LD block describing Events. Parse the blocks
      // rather than regex-matching "Event" anywhere on the page, because
      // the word appears in ordinary copy constantly.
      const eventTyped = scripts.some((script) => {
        if (!/ld\+json/i.test(script.attributes)) return false;
        try {
          const parsed = JSON.parse(script.body.trim());
          return JSON.stringify(parsed).match(/"@type"\s*:\s*"[^"]*Event[^"]*"/i) !== null;
        } catch {
          // Malformed JSON-LD is common; fall back to a scoped check
          // INSIDE the ld+json block only, never the whole document.
          return /"@type"\s*:\s*"[^"]*Event[^"]*"/i.test(script.body);
        }
      });
      return { confirmed: eventTyped, detail: eventTyped ? "JSON-LD block with an Event @type" : "no ld+json block declaring an Event @type" };
    }
    case "WORDPRESS_TRIBE_API": {
      const tribe = /\/wp-json\/tribe\/events/i.test(text) || /tribe-events/i.test(text) || /tribe_events/i.test(text);
      return { confirmed: tribe, detail: tribe ? "The Events Calendar (tribe) markers present" : "no tribe/The Events Calendar markers" };
    }
    case "STATIC_HTML_CARDS": {
      // The configuration-only route presumes dated event content is
      // actually server-rendered. Three or more distinct date-like strings
      // in the delivered HTML is the honest precondition.
      const datePatterns = [
        /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi,
        /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+\d{1,2}\b/gi,
        /\b\d{4}-\d{2}-\d{2}\b/g,
        /datetime\s*=\s*["'][^"']+["']/gi,
      ];
      const hits = new Set();
      for (const pattern of datePatterns) for (const match of text.match(pattern) ?? []) hits.add(match.toLowerCase());
      return {
        confirmed: hits.size >= 3,
        detail: `${hits.size} distinct date-like strings in the server-rendered HTML`,
      };
    }
    case "OTHER_EMBEDDED_APP_STATE":
      // The claim is "there is reusable embedded application state here".
      // That requires a substantive embedded JSON payload that is not the
      // WordPress emoji block — the exact shape the spot audit caught.
      return {
        confirmed: substantive.length > 0,
        detail: scripts.length === 0
          ? "no application/json script on the page at all"
          : substantive.length === 0
            ? "only boilerplate/emoji JSON scripts present"
            : `${substantive.length} substantive embedded JSON payload(s)`,
      };
    default:
      return { confirmed: null, detail: "no verification rule for this family" };
  }
}

async function auditOne(source, { fetchDocument, timeoutMs }) {
  const checkedAt = new Date().toISOString();
  try {
    const document = await Promise.race([
      fetchDocument(source.source_url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("family audit timeout")), timeoutMs)),
    ]);
    const ok = document.status >= 200 && document.status < 300;
    if (!ok) {
      return { calendar_source_id: source.calendar_source_id, source_url: source.source_url, source_family: source.source_family, verdict: "UNREACHABLE", detail: `HTTP ${document.status}`, checked_at: checkedAt };
    }
    const { confirmed, detail } = verifyFamilyClaim(source.source_family, document.body ?? document.text ?? "");
    return {
      calendar_source_id: source.calendar_source_id,
      source_url: source.source_url,
      source_family: source.source_family,
      verdict: confirmed === null ? "NOT_VERIFIABLE" : confirmed ? "CONFIRMED" : "NOT_CONFIRMED",
      detail,
      checked_at: checkedAt,
    };
  } catch (error) {
    return { calendar_source_id: source.calendar_source_id, source_url: source.source_url, source_family: source.source_family, verdict: "UNREACHABLE", detail: String(error?.message ?? error), checked_at: checkedAt };
  }
}

const defaultFetchDocument = async (url) => {
  const response = await fetchText(url);
  return { status: response.status, body: response.text };
};

/**
 * Audit sources whose family feeds the TIER2 headline. Each source is
 * isolated: one failure never affects another's verdict.
 */
export async function auditSourceFamilies(sources, {
  concurrency = 6,
  timeoutMs = 20000,
  fetchDocument = defaultFetchDocument,
  onProgress = () => {},
} = {}) {
  const pending = sources.filter((source) => TIER2_CONTRIBUTING_FAMILIES.has(source.source_family));
  const results = new Array(pending.length);
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      const index = cursor++;
      results[index] = await auditOne(pending[index], { fetchDocument, timeoutMs });
      onProgress(++done, pending.length);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, pending.length)) }, worker));
  return results;
}

/**
 * Apply audit verdicts conservatively. A family claim that the live page
 * does not support must not keep feeding the reusable-family headline, so
 * it is downgraded to SOURCE_REVIEW_REQUIRED and the reason retained.
 * CONFIRMED sources are left exactly as they were — this only ever
 * removes false confidence, never adds confidence.
 */
export function applyAuditVerdicts(sources, verdicts, { resetReadiness } = {}) {
  const byId = new Map(verdicts.map((verdict) => [verdict.calendar_source_id, verdict]));
  let downgraded = 0;
  const updated = sources.map((rawSource) => {
    // The audit must be IDEMPOTENT: re-running it after a rule is
    // corrected has to be able to RESTORE a source that a previous,
    // flawed run downgraded. Without this reset the downgrades accumulate
    // and a fixed rule can never give a source its readiness back.
    let source = rawSource;
    if (rawSource.family_audit_verdict && typeof resetReadiness === "function") {
      const clean = { ...rawSource };
      delete clean.family_audit_verdict;
      delete clean.family_audit_detail;
      delete clean.family_audit_checked_at;
      source = { ...clean, acquisition_readiness: resetReadiness(clean) };
    }
    const verdict = byId.get(source.calendar_source_id);
    if (!verdict || verdict.verdict !== "NOT_CONFIRMED") return source;
    downgraded += 1;
    return {
      ...source,
      acquisition_readiness: "SOURCE_REVIEW_REQUIRED",
      family_audit_verdict: verdict.verdict,
      family_audit_detail: verdict.detail,
      family_audit_checked_at: verdict.checked_at,
    };
  });
  return { sources: updated, downgraded };
}
