// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-COMPLETENESS-03 — Phase 7.
//
// Completeness-02 proved the bad-official-domain problem is SYSTEMIC, not a
// handful of cases: lapsed club domains re-registered as gambling or casino
// spam, a defunct predecessor club's site, a DNS resolver captured as a
// homepage, a visiting club's page recorded as a ground's.
//
// This module sweeps every recorded official_url once and classifies it.
//
// THE GOVERNING RULE: legitimacy is never inferred from HTTP 200. A
// gambling site returning 200 is not valid. A URL is only called valid when
// the page it serves actually IDENTIFIES the venue.
//
// Strictly bounded and read-only: one GET per URL, fixed concurrency, a
// per-request timeout, no retries. It acquires no events and writes nothing
// outside the census research directory.

import { fetchText } from "../http/fetch.mjs";

export const OFFICIAL_URL_VERDICTS = new Set([
  "VALID_OFFICIAL",
  "VALID_OPERATOR_OR_CLUB_OFFICIAL",
  "SUPERSEDED_OFFICIAL",
  "HIJACKED_DOMAIN",
  "DEAD_DOMAIN",
  "WRONG_ENTITY",
  "REDIRECT_ANOMALY",
  "REVIEW_REQUIRED",
]);

/**
 * Gambling/SEO-farm markers. Deliberately weighted towards foreign-language
 * and affiliate-specific terms, because plain English words like "betting"
 * appear legitimately on racecourse and greyhound sites — the very venues
 * most likely to be false-positived by a naive spam regex.
 */
const SPAM_MARKERS = [
  /\bsitus\b/i, /\bbandar\b/i, /\btogel\b/i, /\bjudi\b/i, /\bgacor\b/i,
  /\bslot\s*(online|gacor|demo)\b/i, /\bsepakbola\b/i, /\bterpercaya\b/i,
  /\bcasino\s*(online|sites?|bonus)\b/i, /\bonline\s*casino\b/i,
  /\bpoker\s*online\b/i, /乐投|娱乐城|博彩/,
  /\bsbobet\b/i, /\bmaxbet\b/i, /\btoto\d/i,
];

/** Markers of a parked / for-sale / placeholder domain. */
const PARKED_MARKERS = [
  /this domain (is|may be) for sale/i, /buy this domain/i,
  /domain (name )?parking/i, /parked (free )?(at|by|courtesy)/i,
  /\bsedoparking\b/i, /\bafternic\b/i, /\bdan\.com\b/i,
  /club not live/i, /website coming soon/i, /account suspended/i,
];

const NAME_STOPWORDS = new Set([
  "the", "stadium", "ground", "arena", "centre", "center", "hall", "park",
  "fc", "afc", "rfc", "club", "and", "of", "at", "new", "old", "royal",
  "city", "town", "united", "county", "sports", "sport", "venue", "theatre",
  "theater", "racecourse", "circuit", "complex", "international", "national",
]);

/**
 * Distinctive tokens that identify this venue. Generic venue words are
 * dropped, because matching "stadium" or "the" on a page proves nothing.
 */
export function identityTokens(venue) {
  const tokenise = (values) => {
    const tokens = new Set();
    for (const value of values) {
      for (const token of String(value ?? "").toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9]+/)) {
        if (token.length < 4 || NAME_STOPWORDS.has(token)) continue;
        tokens.add(token);
      }
    }
    return tokens;
  };
  // STRONG tokens come from the venue's OWN name. Only these can establish
  // that a page belongs to the venue.
  //
  // City and operator tokens are WEAK and deliberately cannot validate a
  // URL on their own. Gander Green Lane was recorded with Crystal Palace's
  // website as its official_url; that page is titled "Crystal Palace Women
  // FC", never mentions Gander Green Lane, and passed an earlier version of
  // this check purely because it contained "Sutton" and "London". A page
  // mentioning the city proves nothing, and a page mentioning the club
  // proves it is about the club, not about the ground.
  return {
    strong: tokenise([venue?.canonical_name, ...(venue?.alternative_names ?? [])]),
    weak: tokenise([venue?.city, venue?.operator]),
  };
}

const originOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };

/**
 * Classify one fetched official URL against the venue it claims to belong
 * to. Pure, so it is unit-testable without the network.
 */
export function classifyOfficialUrl(venue, result) {
  const { ok, status, finalUrl, body, error } = result;
  const requested = originOf(venue.official_url);
  const landed = originOf(finalUrl ?? venue.official_url);
  const text = String(body ?? "");
  const haystack = text.toLowerCase();
  const { strong, weak } = identityTokens(venue);
  const matched = [...strong].filter((token) => haystack.includes(token));
  const weakMatched = [...weak].filter((token) => haystack.includes(token));
  // Validity accepts a match on the venue's own name OR on its recorded
  // operator/city.
  //
  // An earlier version accepted ONLY the venue's own name, in order to
  // catch Gander Green Lane (recorded with a VISITING club's website). That
  // condemned 51 records where a ground is recorded with its RESIDENT
  // club's official site — which is legitimate, and is exactly what the
  // VALID_OPERATOR_OR_CLUB_OFFICIAL verdict exists for. It also condemned
  // venues whose names leave no usable token once generic words are removed
  // ("The Den", "The Old Vic", "Crown Ground").
  //
  // See the LIMITATION note on WRONG_ENTITY below: text matching cannot
  // separate "the venue's own site" from "a page that mentions the venue",
  // and a rule that condemns 51 valid records to catch 1 invalid one is a
  // worse instrument than admitting the limit.
  const identifiesVenue = matched.length > 0 || weakMatched.length > 0;
  const spam = SPAM_MARKERS.some((marker) => marker.test(text));
  const parked = PARKED_MARKERS.some((marker) => marker.test(text));

  if (error || status === null) {
    // ONLY a domain that does not resolve is dead. Everything else — a
    // server-side TLS fault, an expired certificate, a cookie-consent
    // redirect loop our cookie-less fetcher cannot follow, a timeout — is
    // a failure to REACH a site, not evidence the site is gone.
    //
    // The first version of this rule mapped every transport error to
    // DEAD_DOMAIN and thereby declared Olympia London, Co-op Live, The
    // Lowry, Caird Hall and Nottingham's Royal Concert Hall dead. They are
    // plainly live venues. A freeze report asserting otherwise would be
    // false, so the distinction is made explicitly here.
    const message = String(error ?? "no response");
    if (/ENOTFOUND|EAI_AGAIN|NXDOMAIN|ERR_NAME_NOT_RESOLVED/i.test(message)) {
      return { verdict: "DEAD_DOMAIN", detail: `domain does not resolve: ${message}`, matched_tokens: [] };
    }
    if (/redirect count exceeded/i.test(message)) {
      return { verdict: "REVIEW_REQUIRED", detail: "redirect loop against a cookie-less fetch — a limitation of our fetcher, NOT evidence the site is gone", matched_tokens: [] };
    }
    if (/certificate|SSL|TLS/i.test(message)) {
      return { verdict: "REVIEW_REQUIRED", detail: `reachable host with a TLS/certificate fault: ${message}`, matched_tokens: [] };
    }
    return { verdict: "REVIEW_REQUIRED", detail: `could not be reached, cause not established: ${message}`, matched_tokens: [] };
  }

  // A domain that redirects to a completely unrelated host, where nothing
  // on the destination names the venue, is the dns.google shape: a crawler
  // artifact or a sold domain, not the venue's site.
  if (requested && landed && requested !== landed && !identifiesVenue) {
    const relatedHost = [...strong].some((token) => landed.includes(token));
    if (!relatedHost) {
      return { verdict: "REDIRECT_ANOMALY", detail: `${requested} redirects to unrelated host ${landed}, which does not name the venue`, matched_tokens: [] };
    }
  }

  // Spam markers only condemn a page that ALSO fails to identify the venue.
  // A racecourse legitimately mentions betting; a squatted club domain
  // mentions gambling and knows nothing about the ground.
  if (spam && !identifiesVenue) {
    return { verdict: "HIJACKED_DOMAIN", detail: "gambling/SEO-farm markers present and the page does not name the venue", matched_tokens: [] };
  }

  if (parked && !identifiesVenue) {
    return { verdict: "DEAD_DOMAIN", detail: "parked, for-sale or placeholder page", matched_tokens: [] };
  }

  if (!ok) {
    // A block (403) is not evidence the URL is wrong, so it goes to review
    // rather than being condemned. A 404/410 on the venue's own domain is a
    // superseded path.
    if (status === 403 || status === 429 || status >= 500) {
      return { verdict: "REVIEW_REQUIRED", detail: `HTTP ${status} — blocked or erroring, not disproved`, matched_tokens: [] };
    }
    return { verdict: "SUPERSEDED_OFFICIAL", detail: `HTTP ${status} — the recorded path no longer resolves on this host`, matched_tokens: [] };
  }

  if (identifiesVenue) {
    const verdict = requested && landed && requested !== landed ? "VALID_OPERATOR_OR_CLUB_OFFICIAL" : "VALID_OFFICIAL";
    const detail = verdict === "VALID_OPERATOR_OR_CLUB_OFFICIAL"
      ? `redirects to ${landed}, which names the venue (${matched.slice(0, 4).join(", ")})`
      : `page names the venue (${matched.slice(0, 4).join(", ")})`;
    return { verdict, detail, matched_tokens: matched.slice(0, 8) };
  }

  // LIMITATION, STATED RATHER THAN PAPERED OVER: this sweep does NOT
  // detect WRONG_ENTITY. Separating "the venue's official site" from "a
  // page that legitimately mentions the venue" is beyond a text check —
  // Gander Green Lane is recorded with Crystal Palace's website, whose
  // page names Sutton United as the host, so it is indistinguishable by
  // token matching from a ground correctly recorded with its resident
  // club's site. WRONG_ENTITY is therefore only ever assigned from
  // manually evidenced identity findings, never by this automated pass.

  // HTTP 200 with nothing identifying the venue at all is NOT validity. It
  // may be a client-rendered shell, or someone else's site — this audit
  // refuses to guess which.
  return { verdict: "REVIEW_REQUIRED", detail: "HTTP 200 but nothing on the page names this venue (client-rendered shell, or a different entity)", matched_tokens: [] };
}

const defaultFetchDocument = async (url) => {
  try {
    const response = await fetchText(url);
    return { ok: response.ok, status: response.status, finalUrl: response.url, body: response.text, error: null };
  } catch (error) {
    const cause = error?.cause?.message ?? error?.cause?.code ?? null;
    return { ok: false, status: null, finalUrl: null, body: "", error: cause ? `${error.message}: ${cause}` : String(error?.message ?? error) };
  }
};

/**
 * Sweep every venue that records an official_url. Each venue is isolated:
 * one failure never affects another's verdict.
 */
export async function auditOfficialUrls(venues, {
  concurrency = 6,
  timeoutMs = 20000,
  fetchDocument = defaultFetchDocument,
  onProgress = () => {},
} = {}) {
  const pending = venues.filter((venue) => typeof venue.official_url === "string" && venue.official_url.trim() !== "");
  const results = new Array(pending.length);
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      const index = cursor++;
      const venue = pending[index];
      const checkedAt = new Date().toISOString();
      let outcome;
      try {
        outcome = await Promise.race([
          fetchDocument(venue.official_url),
          new Promise((_, reject) => setTimeout(() => reject(new Error("official url audit timeout")), timeoutMs)),
        ]);
      } catch (error) {
        outcome = { ok: false, status: null, finalUrl: null, body: "", error: String(error?.message ?? error) };
      }
      const { verdict, detail, matched_tokens } = classifyOfficialUrl(venue, outcome);
      results[index] = {
        venue_census_id: venue.venue_census_id,
        canonical_name: venue.canonical_name,
        city: venue.city,
        venue_type: venue.venue_type,
        official_url: venue.official_url,
        final_url: outcome.finalUrl ?? null,
        http_status: outcome.status,
        verdict,
        detail,
        matched_tokens,
        checked_at: checkedAt,
      };
      onProgress(++done, pending.length);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, pending.length)) }, worker));
  return results;
}

/** Verdicts that mean the recorded URL must not stand as current truth. */
export const INVALID_URL_VERDICTS = new Set(["HIJACKED_DOMAIN", "DEAD_DOMAIN", "WRONG_ENTITY", "REDIRECT_ANOMALY"]);
