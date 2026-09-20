import { fingerprintProgrammeSurface } from "../venue-discovery/programme-fingerprint.mjs";

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
const COMMON_PROGRAMME_PATHS = ["/events", "/whats-on", "/whatson", "/programme", "/program", "/calendar", "/agenda", "/concerts", "/gigs", "/shows"];

function links(html, baseUrl) {
  const seen = new Set(); const output = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url; try { url = new URL(match[1], baseUrl); } catch { continue; }
    if (url.origin !== new URL(baseUrl).origin || seen.has(url.href)) continue;
    seen.add(url.href); output.push({ url: url.href, text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
  }
  return output;
}

export function rankProgrammeCandidates(homepage) {
  const candidates = links(homepage.body, homepage.url).map((candidate) => {
    const signal = `${candidate.url} ${candidate.text}`;
    return { ...candidate, score: (POSITIVE.test(signal) ? 40 : 0) - (NEGATIVE.test(signal) ? 35 : 0), evidence: POSITIVE.test(signal) ? ["programme-like navigation label or URL"] : [], source: "HOMEPAGE_NAVIGATION_LINK" };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
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
    const evidenceScore = candidate.score + futureDates * 5 + (fingerprint.detected_mechanisms.includes("JSON_LD_EVENT") ? 40 : 0) + (fingerprint.detected_mechanisms.includes("LIST_TO_DETAIL_HTML") ? 25 : 0) + (fingerprint.detected_mechanisms.includes("ICS_OR_ICAL") ? 30 : 0);
    examined.push({ ...candidate, page, fingerprint, futureDates, evidenceScore });
  }
  const selected = examined.filter((item) => item.page?.status >= 200 && item.page.status < 300 && item.evidenceScore >= 50).sort((a, b) => b.evidenceScore - a.evidenceScore || a.url.localeCompare(b.url))[0] ?? null;
  return { state: selected ? "PROGRAMME_SOURCE_RESOLVED" : "PROGRAMME_SOURCE_UNRESOLVED", selected: selected ? { url: selected.page.url, discovery: selected.source ?? "HOMEPAGE_NAVIGATION_LINK", evidence: selected.evidence, score: selected.evidenceScore } : null, considered: examined.map(({ page, ...item }) => ({ ...item, status: page?.status ?? null })) };
}
