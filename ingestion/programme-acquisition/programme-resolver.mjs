import { fingerprintProgrammeSurface } from "../venue-discovery/programme-fingerprint.mjs";

const POSITIVE = /\b(events?|what'?s on|programme|program|calendar|gigs?|live|concerts?|shows?|agenda|listings?|performances?)\b/i;
const NEGATIVE = /\b(blog|news|press|menu|food|drink|hire|private|about|contact|accessibility|privacy|terms)\b/i;
const DATE = /\b20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g;
// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: real UK venue
// listing pages overwhelmingly write visible dates as "Wed 7 Oct" /
// "7 October 2026", never the numeric ISO-ish form DATE (above) matches —
// a real page with a dozen genuine upcoming gigs can score ZERO future-date
// evidence under DATE alone purely because of this format mismatch, not
// because it lacks real events. UK_TEXT_DATE catches the day-name + day +
// month-abbreviation/name pattern that dominates real venue markup.
const UK_TEXT_DATE = /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi;

// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: real-world venue
// navigation commonly HTML-entity-encodes an apostrophe in "What's On"
// labels (e.g. "What&#039;s on") — decoding the common entities before
// text is scored against POSITIVE/NEGATIVE below is required for that
// extremely common label to ever be recognised; a raw, undecoded
// "&#039;" never matches `what'?s on`.
const HTML_ENTITIES = new Map([
  ["&#039;", "'"], ["&#39;", "'"], ["&apos;", "'"], ["&rsquo;", "'"], ["&lsquo;", "'"],
  ["&amp;", "&"], ["&quot;", '"'], ["&nbsp;", " "],
]);
function decodeHtmlEntities(text) {
  let out = text;
  for (const [entity, char] of HTML_ENTITIES) out = out.split(entity).join(char);
  return out;
}

function links(html, baseUrl) {
  // The SAME href commonly appears more than once on a real page (a
  // minimal icon-only nav link, then a fuller "See all What's on"
  // call-to-action later on the page) — text is MERGED across every
  // occurrence of the same URL, never just the first, so a candidate is
  // never lost purely because its FIRST appearance happened to carry
  // sparser or differently-encoded text than a later one.
  const byUrl = new Map();
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url; try { url = new URL(match[1], baseUrl); } catch { continue; }
    if (url.origin !== new URL(baseUrl).origin) continue;
    const text = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!byUrl.has(url.href)) byUrl.set(url.href, []);
    if (text) byUrl.get(url.href).push(text);
  }
  return [...byUrl.entries()].map(([href, texts]) => ({ url: href, text: texts.join(" ") }));
}

export function rankProgrammeCandidates(homepage) {
  const candidates = links(homepage.body, homepage.url).map((candidate) => {
    const signal = `${candidate.url} ${candidate.text}`;
    return { ...candidate, score: (POSITIVE.test(signal) ? 40 : 0) - (NEGATIVE.test(signal) ? 35 : 0), evidence: POSITIVE.test(signal) ? ["programme-like navigation label or URL"] : [] };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return candidates;
}

export async function resolveProgrammeSource({ homepage, fetchDocument, maxCandidates = 4 } = {}) {
  const considered = rankProgrammeCandidates(homepage).slice(0, maxCandidates);
  const examined = [];
  for (const candidate of considered) {
    let page; try { page = await fetchDocument(candidate.url); } catch (error) { examined.push({ ...candidate, error: String(error) }); continue; }
    const fingerprint = fingerprintProgrammeSurface(page);
    const futureDates = (page.body.match(DATE) ?? []).length + (page.body.match(UK_TEXT_DATE) ?? []).length;
    const evidenceScore = candidate.score + futureDates * 5 + (fingerprint.detected_mechanisms.includes("JSON_LD_EVENT") ? 40 : 0) + (fingerprint.detected_mechanisms.includes("LIST_TO_DETAIL_HTML") ? 25 : 0) + (fingerprint.detected_mechanisms.includes("ICS_OR_ICAL") ? 30 : 0);
    examined.push({ ...candidate, page, fingerprint, futureDates, evidenceScore });
  }
  const selected = examined.filter((item) => item.page?.status >= 200 && item.page.status < 300 && item.evidenceScore >= 50).sort((a, b) => b.evidenceScore - a.evidenceScore || a.url.localeCompare(b.url))[0] ?? null;
  return { state: selected ? "PROGRAMME_SOURCE_RESOLVED" : "PROGRAMME_SOURCE_UNRESOLVED", selected: selected ? { url: selected.page.url, discovery: "BOUNDED_SAME_ORIGIN_NAVIGATION", evidence: selected.evidence, score: selected.evidenceScore } : null, considered: examined.map(({ page, ...item }) => ({ ...item, status: page?.status ?? null })) };
}
