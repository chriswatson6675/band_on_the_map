import { fingerprintProgrammeSurface } from "../venue-discovery/programme-fingerprint.mjs";
import { parseCompleteCardDate } from "../static-cards/card-date.mjs";

const POSITIVE = /\b(events?|what'?s on|programme|program|calendar|gigs?|live|concerts?|shows?|agenda|listings?|performances?)\b/i;
const NEGATIVE = /\b(blog|news|press|menu|food|drink|hire|private|about|contact|accessibility|privacy|terms)\b/i;
const DATE = /\b20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g;

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-AND-DISCOVERY-CORRECTION-01 — a
// fixed, bounded list of common deterministic programme paths, tried
// directly against a source's own origin regardless of whether the
// homepage's own <a href> navigation happens to link one of them with
// matching text. A real Manchester calibration run showed most venues
// with a real, working programme were missed by homepage-nav-link
// scanning alone (no matching <a> text, JS-rendered nav, etc.) even
// though their programme lived at one of these ordinary paths. Fixed,
// small, never brute-forced/expanded per-venue — see resolveProgrammeSource's
// own bounded-request-budget guarantee below.
// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — "The Events
// Calendar" WordPress plugin's own bundled REST API always lives at this
// exact, fixed, plugin-defined path (see ingestion/events-calendar-api/
// client.mjs's own DEFAULT_REST_PATH, already proven live against Centro
// Cultural de Belém) — a deterministic common path exactly like the
// other ten, never a per-venue guess. Trying it costs one bounded fetch
// against every source's own origin; a non-WordPress site simply 404s
// like any other absent common path, an honest, non-fatal outcome.
const COMMON_PROGRAMME_PATHS = ["/events", "/whats-on", "/whatson", "/programme", "/program", "/calendar", "/agenda", "/concerts", "/gigs", "/shows", "/wp-json/tribe/events/v1/events/"];

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real
// Manchester venue (RNCM) links 29 same-scoring nav candidates on its
// own homepage (individual performance pages, alumni sub-pages, ...),
// with its own real programme listing (/whats-on/events/) landing at
// position 20 among them purely by alphabetical chance ("alumni-home"
// sorts before "whats-on") — exactly at the maxCandidates=20 cutoff
// below, so it was silently EXCLUDED from ever being fetched or scored
// at all, no matter how well any later content-based signal might have
// favoured it. Deciding WHICH candidates make it into the bounded
// budget is therefore just as important as scoring the ones that do.
// An index/listing page's URL path overwhelmingly ends in a short,
// generic word (exactly the same vocabulary COMMON_PROGRAMME_PATHS
// already uses), while a detail page's own path ends in a long,
// specific, hyphenated slug — a free, deterministic, no-fetch-required
// signal, reused (not duplicated) both here, as a same-score TIE-BREAK
// so index-shaped candidates are never starved out of the bounded
// candidate set, and again below in the real evidenceScore once a
// candidate has actually been fetched. Checked against the FINAL path
// segment only (never a substring match), so a false-positive shape
// like "/photo-gallery/events-gallery/" (a real Manchester page — a
// photo gallery, not a programme) is correctly excluded: its last
// segment is "events-gallery" as ONE compound word, not "events" alone.
const INDEX_PATH_WORDS = new Set(COMMON_PROGRAMME_PATHS.map((path) => path.replace(/^\/|\/$/g, "").toLowerCase()).filter((word) => word && !word.includes("/")));

function isIndexShapedPath(url) {
  let pathname; try { pathname = new URL(url).pathname; } catch { return false; }
  const lastSegment = pathname.replace(/\/+$/, "").split("/").pop()?.toLowerCase() ?? "";
  return INDEX_PATH_WORDS.has(lastSegment);
}

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — a real
// Manchester venue (The Warehouse Project) serves its homepage at
// www.thewarehouseproject.com with NO redirect, while every one of its
// own internal navigation links points to the bare
// thewarehouseproject.com (no "www.") — the same real operator, the
// same real site, just an ordinary, common inconsistency in which
// subdomain a link author used. Strict origin equality (protocol + host
// + port) treats these as two different origins and silently discards
// every such link. This is deliberately narrow: it only ever treats
// "www." and its own bare host as equivalent — never any other
// subdomain, and never a genuinely different registrable domain (a
// ticketing partner, a social platform, ...), so it cannot be used to
// "follow out" to an unrelated site.
function bareHost(hostname) {
  return hostname.replace(/^www\./i, "");
}
function sameSite(a, b) {
  return a.protocol === b.protocol && a.port === b.port && bareHost(a.hostname) === bareHost(b.hostname);
}

function links(html, baseUrl) {
  const seen = new Set(); const output = [];
  const base = new URL(baseUrl);
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url; try { url = new URL(match[1], baseUrl); } catch { continue; }
    if (!sameSite(url, base) || seen.has(url.href)) continue;
    seen.add(url.href); output.push({ url: url.href, text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
  }
  return output;
}

export function rankProgrammeCandidates(homepage) {
  const candidates = links(homepage.body, homepage.url).map((candidate) => {
    const signal = `${candidate.url} ${candidate.text}`;
    return { ...candidate, score: (POSITIVE.test(signal) ? 40 : 0) - (NEGATIVE.test(signal) ? 35 : 0), evidence: POSITIVE.test(signal) ? ["programme-like navigation label or URL"] : [], source: "HOMEPAGE_NAVIGATION_LINK" };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || (Number(isIndexShapedPath(b.url)) - Number(isIndexShapedPath(a.url))) || a.url.localeCompare(b.url));
  return candidates;
}

/** The fixed common-path list, resolved against the homepage's own origin — never a guess at a venue-specific path. */
export function commonPathCandidates(baseUrl) {
  const origin = new URL(baseUrl).origin;
  return COMMON_PROGRAMME_PATHS.map((path) => ({ url: `${origin}${path}`, text: `(common programme path ${path})`, score: 20, evidence: ["common deterministic programme path"], source: "COMMON_DETERMINISTIC_PATH" }));
}

/**
 * sitemap.xml discovery (checking /sitemap.xml directly and any
 * `Sitemap:` reference in /robots.txt), filtered to programme-like URLs
 * only. Every fetch here goes through the SAME caller-supplied
 * `fetchDocument` as every other candidate — same retry/timeout/stage
 * tagging, same bounded-request accounting — nothing here is a second,
 * independently-behaving network path. Absence of robots.txt/sitemap.xml
 * is a normal, non-fatal outcome, not an error.
 */
const SITEMAP_URL_PATTERN = /sitemap.*\.xml(?:[?#]|$)/i;

/**
 * A WordPress-family site's own /sitemap.xml is very commonly a
 * SITEMAP INDEX (`<sitemapindex>`) listing per-post-type sub-sitemaps
 * (e.g. sitemap-posttype-event.xml) rather than a `<urlset>` of real
 * pages directly. Real evidence: a `<loc>sitemap-posttype-event.xml</loc>`
 * entry's own URL contains the word "event", which legitimately matches
 * the same POSITIVE signal a real programme page would — but the sub-
 * sitemap itself is a URL LIST, not an HTML programme page; scoring its
 * raw XML body as if it were one (its many <loc> date-like slugs falsely
 * inflate the date-count bonus) is exactly wrong. Following it ONE more
 * bounded level and treating ITS <loc> entries as the real candidates is
 * the correct, still-fully-bounded fix — never followed recursively
 * beyond this second level.
 */
function isSitemapIndexBody(body) {
  return /<sitemapindex\b/i.test(String(body));
}

function locEntries(body) {
  return [...String(body).matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
}

export async function sitemapCandidates(baseUrl, fetchDocument) {
  const origin = new URL(baseUrl).origin;
  const sitemapUrls = new Set([`${origin}/sitemap.xml`]);
  try {
    const robots = await fetchDocument(`${origin}/robots.txt`);
    if (robots?.status >= 200 && robots.status < 300) {
      for (const match of String(robots.body).matchAll(/^Sitemap:\s*(\S+)/gim)) {
        try { sitemapUrls.add(new URL(match[1], origin).href); } catch { /* malformed Sitemap: line — ignore */ }
      }
    }
  } catch { /* robots.txt absent/unreachable — not fatal */ }

  const found = [];
  for (const sitemapUrl of [...sitemapUrls].slice(0, 2)) {
    try {
      const sitemap = await fetchDocument(sitemapUrl);
      if (!sitemap || sitemap.status < 200 || sitemap.status >= 300) continue;

      if (isSitemapIndexBody(sitemap.body)) {
        // One bounded extra level: only sub-sitemaps whose own URL looks
        // programme-relevant (e.g. "sitemap-posttype-event.xml") are worth
        // the extra fetch at all — never every sub-sitemap a large site
        // might list (post sitemap, page sitemap, category sitemap, ...).
        const subSitemapUrls = locEntries(sitemap.body).filter((loc) => POSITIVE.test(loc)).slice(0, 2);
        for (const subUrl of subSitemapUrls) {
          try {
            const subSitemap = await fetchDocument(subUrl);
            if (!subSitemap || subSitemap.status < 200 || subSitemap.status >= 300) continue;
            for (const loc of locEntries(subSitemap.body)) {
              if (POSITIVE.test(loc) && !NEGATIVE.test(loc)) found.push({ url: loc, text: "(sitemap.xml entry)", score: 30, evidence: ["sitemap.xml programme-like URL (via sitemap index)"], source: "SITEMAP_XML" });
            }
          } catch { /* sub-sitemap absent/unreachable — not fatal */ }
        }
        continue;
      }

      for (const loc of locEntries(sitemap.body)) {
        if (SITEMAP_URL_PATTERN.test(loc)) continue; // a <urlset> should never itself list another sitemap; skip defensively rather than mis-score it as a page
        if (POSITIVE.test(loc) && !NEGATIVE.test(loc)) found.push({ url: loc, text: "(sitemap.xml entry)", score: 30, evidence: ["sitemap.xml programme-like URL"], source: "SITEMAP_XML" });
      }
    } catch { /* sitemap.xml absent/unreachable at this candidate URL — not fatal */ }
  }
  return found.slice(0, 5);
}

/**
 * `maxCandidates` now bounds the TOTAL distinct URLs examined across all
 * three discovery mechanisms (homepage nav-links, common deterministic
 * paths, sitemap.xml) — still one fixed, small, deterministic request
 * budget, never an unbounded crawl and never recursive (no candidate's
 * own page is ever itself scanned for further links).
 */
const JSON_LD_EVENT_ENTITY = /"@type"\s*:\s*"(?:Event|MusicEvent|TheaterEvent|Festival)"/gi;
const ICS_VEVENT_ENTITY = /BEGIN:VEVENT/gi;

/**
 * BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — the deterministic
 * "listing vs. one individual event page" signal Phase 7 of this
 * package's brief asks for. A real calibration run found the resolver
 * repeatedly selecting a single event's own detail page over the venue's
 * actual programme/listing index, because JSON_LD_EVENT's fixed +40 bonus
 * rewards ANY page carrying at least one Event block equally, whether it
 * carries one or fifty. Counting distinct event entities (JSON-LD
 * Event/MusicEvent/TheaterEvent/Festival blocks, or ICS VEVENT blocks) is
 * a direct, structural count — never inferred from URL shape or guessed —
 * so a page with many distinct events scores meaningfully higher than one
 * with exactly one, without ever penalising the single-event page itself
 * (it may legitimately be the only candidate available).
 */
function countEventEntities(body) {
  const text = String(body ?? "");
  return Math.max((text.match(JSON_LD_EVENT_ENTITY) ?? []).length, (text.match(ICS_VEVENT_ENTITY) ?? []).length);
}

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real
// Manchester run found JSON_LD_EVENT's fixed +40 bonus rewarding a
// stale, single-event archive page (Aviva Studios: a 2023 event,
// surfaced via sitemap.xml) enough to outrank the venue's own real,
// current listing page, which happened not to be JSON-LD-fingerprinted
// at all. The bonus is withheld ONLY when every extractable JSON-LD
// startDate on the page is confirmedly in the past — never when a date
// is unparseable or absent (uncertainty is never treated as evidence
// of staleness) and never for a page mixing past and future events
// (a real, common listing shape). parseCompleteCardDate is reused
// unchanged from static-cards/card-date.mjs — the SAME deterministic,
// no-year-invention date parser already proven against real textual
// dates ("25 Apr 2023, midnight" being the exact real Aviva shape).
const JSON_LD_START_DATE = /"startDate"\s*:\s*"([^"]+)"/gi;

function jsonLdHasOnlyPastDates(body, cutoffDate) {
  let sawAny = false;
  for (const match of String(body ?? "").matchAll(JSON_LD_START_DATE)) {
    const parsed = parseCompleteCardDate(match[1]);
    if (!parsed) continue; // unparseable — not evidence either way
    sawAny = true;
    if (!cutoffDate || parsed.iso >= cutoffDate) return false; // a confirmed future/current date found — never withhold
  }
  return sawAny; // true only when at least one date resolved AND every resolved date was in the past
}

export async function resolveProgrammeSource({ homepage, fetchDocument, maxCandidates = 20 } = {}) {
  const navCandidates = rankProgrammeCandidates(homepage);
  const pathCandidates = commonPathCandidates(homepage.url);
  const fromSitemap = await sitemapCandidates(homepage.url, fetchDocument);

  const byUrl = new Map();
  for (const candidate of [...navCandidates, ...pathCandidates, ...fromSitemap]) {
    if (!byUrl.has(candidate.url)) byUrl.set(candidate.url, candidate);
  }
  const considered = [...byUrl.values()].slice(0, maxCandidates);

  const examined = [];
  for (const candidate of considered) {
    let page; try { page = await fetchDocument(candidate.url); } catch (error) { examined.push({ ...candidate, error: String(error) }); continue; }
    const fingerprint = fingerprintProgrammeSurface(page);
    const futureDates = (page.body.match(DATE) ?? []).length;
    const eventEntityCount = countEventEntities(page.body);
    // A page carrying 2+ distinct event entities is structural evidence
    // this is the recurring programme/listing index, not one event's own
    // page — rewarded meaningfully (capped, still deterministic/bounded).
    // A single (or zero) entity gets none of this bonus, so a genuine
    // lone-event page is never penalised relative to today's behaviour.
    const listingBonus = eventEntityCount >= 2 ? Math.min(eventEntityCount, 20) * 15 : 0;
    // BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — STATIC_HTML_CARDS
    // was the one already-implemented, generically-reachable mechanism
    // (confirmed by this package's own collector-dispatch-audit MATRIX
    // test) with NO scoring bonus at all here: a page whose only signal
    // is server-rendered event-card markup, with no JSON-LD and no
    // ISO-date-regex match (a real Manchester case: RNCM's own
    // /whats-on/events/ page uses plain "Sep 20th"-style text, no
    // machine-readable date), could never clear the selection threshold
    // even though the collector that would run on it already exists and
    // already works — a selection-scoring gap, not a dispatch gap.
    const jsonLdEventBonus = fingerprint.detected_mechanisms.includes("JSON_LD_EVENT") && !jsonLdHasOnlyPastDates(page.body, page.at?.slice(0, 10) ?? null) ? 40 : 0;
    // BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real
    // Manchester site (manchestertheatres.com) has a client-rendered
    // /whatson page carrying 86 incidental ISO-date-shaped substrings
    // (embedded config/hydration data, not real distinct events) —
    // CLIENT_RENDERED_UNKNOWN's own condition already means "no
    // dispatchable structure was found here at all" (see
    // routeCollectorCapability: it always maps to BROWSER_REQUIRED, never
    // to a real collector), so a page whose ONLY signal is that fallback
    // can never actually be turned into a proven result even if
    // selected — rewarding it as heavily as a page with a genuinely
    // dispatchable mechanism is always counter-productive, and once this
    // package's OWN candidate-ordering fix (above) correctly stopped
    // starving /whatson-shaped pages out of consideration, its sheer
    // date-text volume was enough to outrank a genuinely working
    // JSON_LD_EVENT individual event page. Both the URL-shape bonus and
    // the raw date-text count are therefore withheld specifically when
    // NO substantive (dispatchable-or-potentially-dispatchable) mechanism
    // was found — never a blanket cap, since a page that DOES carry a
    // real mechanism (STATIC_HTML_CARDS, ICS, Tribe API, ...) keeps full
    // credit for both signals exactly as before.
    const NON_SUBSTANTIVE_MECHANISMS = new Set(["NO_CURRENT_PROGRAMME_FOUND", "CLIENT_RENDERED_UNKNOWN"]);
    const hasSubstantiveFingerprint = fingerprint.detected_mechanisms.some((mechanism) => !NON_SUBSTANTIVE_MECHANISMS.has(mechanism));
    // A CLIENT_RENDERED_UNKNOWN candidate (a real page shell/script
    // marker WAS found, just nothing extractable) still needs to be
    // SELECTABLE when it is the only real option at all — that is how
    // this pipeline reaches the honest BROWSER_REQUIRED terminal state
    // rather than an uninformative PROGRAMME_SOURCE_UNRESOLVED. The
    // reduced (not zeroed) bonus below is calibrated to reliably cross
    // the selection threshold on its own, while still reliably losing to
    // any candidate that DOES carry a real, dispatchable mechanism.
    // NO_CURRENT_PROGRAMME_FOUND (a literally empty/contentless response
    // — no shell marker, no script, nothing) gets neither bonus at all,
    // exactly as before: URL shape alone must never resolve a genuinely
    // empty page.
    const isClientRenderedOnly = fingerprint.mechanism === "CLIENT_RENDERED_UNKNOWN" && !hasSubstantiveFingerprint;
    const indexPathBonus = isIndexShapedPath(candidate.url) ? (hasSubstantiveFingerprint ? 35 : isClientRenderedOnly ? 15 : 0) : 0;
    const futureDatesScore = Math.min(futureDates, hasSubstantiveFingerprint ? 10 : 2) * 5;
    const evidenceScore = candidate.score + futureDatesScore + listingBonus + jsonLdEventBonus + indexPathBonus + (fingerprint.detected_mechanisms.includes("LIST_TO_DETAIL_HTML") ? 25 : 0) + (fingerprint.detected_mechanisms.includes("ICS_OR_ICAL") ? 30 : 0) + (fingerprint.detected_mechanisms.includes("WORDPRESS_TRIBE_API") ? 30 : 0) + (fingerprint.detected_mechanisms.includes("STATIC_HTML_CARDS") ? 30 : 0);
    examined.push({ ...candidate, page, fingerprint, futureDates, eventEntityCount, evidenceScore, indexPathBonus });
  }
  const selected = examined.filter((item) => item.page?.status >= 200 && item.page.status < 300 && item.evidenceScore >= 50).sort((a, b) => b.evidenceScore - a.evidenceScore || a.url.localeCompare(b.url))[0] ?? null;
  return { state: selected ? "PROGRAMME_SOURCE_RESOLVED" : "PROGRAMME_SOURCE_UNRESOLVED", selected: selected ? { url: selected.page.url, discovery: selected.source ?? "HOMEPAGE_NAVIGATION_LINK", evidence: selected.evidence, score: selected.evidenceScore, event_entity_count: selected.eventEntityCount } : null, considered: examined.map(({ page, ...item }) => ({ ...item, status: page?.status ?? null })) };
}
