import { fingerprintProgrammeSurface } from "../venue-discovery/programme-fingerprint.mjs";

const POSITIVE = /\b(events?|what'?s on|programme|program|calendar|gigs?|live|concerts?|shows?|agenda|listings?|performances?)\b/i;
const NEGATIVE = /\b(blog|news|press|menu|food|drink|hire|private|about|contact|accessibility|privacy|terms)\b/i;
const DATE = /\b20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g;

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
    const futureDates = (page.body.match(DATE) ?? []).length;
    const evidenceScore = candidate.score + futureDates * 5 + (fingerprint.detected_mechanisms.includes("JSON_LD_EVENT") ? 40 : 0) + (fingerprint.detected_mechanisms.includes("LIST_TO_DETAIL_HTML") ? 25 : 0) + (fingerprint.detected_mechanisms.includes("ICS_OR_ICAL") ? 30 : 0);
    examined.push({ ...candidate, page, fingerprint, futureDates, evidenceScore });
  }
  const selected = examined.filter((item) => item.page?.status >= 200 && item.page.status < 300 && item.evidenceScore >= 50).sort((a, b) => b.evidenceScore - a.evidenceScore || a.url.localeCompare(b.url))[0] ?? null;
  return { state: selected ? "PROGRAMME_SOURCE_RESOLVED" : "PROGRAMME_SOURCE_UNRESOLVED", selected: selected ? { url: selected.page.url, discovery: "BOUNDED_SAME_ORIGIN_NAVIGATION", evidence: selected.evidence, score: selected.evidenceScore } : null, considered: examined.map(({ page, ...item }) => ({ ...item, status: page?.status ?? null })) };
}
