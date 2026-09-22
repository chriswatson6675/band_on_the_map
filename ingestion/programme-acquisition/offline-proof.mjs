import { extractEventNodes } from "../json-ld/parse.mjs";
import { proofDateFromStartDate } from "./proof-date.mjs";
import { parseCompleteCardDate } from "../static-cards/card-date.mjs";

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function absoluteUrl(value, baseUrl) {
  const text = nonEmpty(value);
  if (!text) return null;
  try {
    const url = new URL(text, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — true only when
 * both already-absolute URLs share an origin. Used to narrow
 * canonicalProofs()'s own JSON-LD-url-must-match-canonical check (see
 * that function's own comment): a real Manchester run found two
 * genuine, real detail pages (The Deaf Institute, Gorilla) whose own
 * canonical link correctly self-identifies the page, but whose Event
 * JSON-LD `url` field points to a third-party ticketing platform
 * (fatsoma.com) rather than back to the page itself — a common,
 * generic, real-world publishing pattern (independent venues widely use
 * external ticketing platforms), not a Manchester-specific quirk.
 */
function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** Return the source-published canonical URL from retained HTML, if present. */
export function canonicalUrlFromHtml(html, documentUrl) {
  if (typeof html !== "string" || !documentUrl) return null;
  const match = html.match(/<link\b[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i);
  return absoluteUrl(match?.[1], documentUrl);
}

// BEATMAPPED-JSON-LD-SELF-REFERENTIAL-EVENT-URL-IDENTITY-01
//
// `canonicalUrlFromHtml()` returns null for two completely different facts:
// the document declares NO canonical link at all, or it declares one whose
// href is missing/empty/unresolvable. Only the first is "canonical absent".
// The second is a canonical the publisher DID declare and we could not read,
// and treating it as absence would bypass an explicit publisher signal. This
// predicate separates the two.
const CANONICAL_LINK_DECLARED = /<link\b[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i;

/**
 * True when the document declares a rel=canonical link element at all,
 * regardless of whether its href is present, non-empty or resolvable.
 */
export function canonicalLinkDeclared(html) {
  return typeof html === "string" && CANONICAL_LINK_DECLARED.test(html);
}

/**
 * The Event node's OWN source-published `url`, returned only when the source
 * published it as an absolute http(s) URL that identifies the fetched detail
 * document itself.
 *
 * Deliberately narrow:
 *  - only the direct string form of `url` counts. The source must publish the
 *    absolute identity itself; nothing is assembled on its behalf.
 *  - the raw published value must already be absolute. A relative token (e.g.
 *    a-trane's `@id` "event_94072_0", or a bare "/events/x") is never resolved
 *    against the document URL to manufacture an identity.
 *  - equality uses absoluteUrl() — the same normalisation canonical proof
 *    already trusts for `canonicalUrl !== documentUrl` — and nothing broader.
 *    No query-string stripping, no print-variant equivalence, no path
 *    collapsing.
 */
function selfReferentialEventUrl(node, documentUrl) {
  const published = nonEmpty(typeof node?.url === "string" ? node.url : null);
  if (!published || !/^https?:\/\//i.test(published)) return null;
  const normalised = absoluteUrl(published, documentUrl);
  return normalised && normalised === documentUrl ? normalised : null;
}

/** An already-absolute source-published `@id`, retained verbatim as evidence.
 * Never used as identity, and never resolved against the document URL. */
function publishedAbsoluteId(node) {
  const published = nonEmpty(typeof node?.["@id"] === "string" ? node["@id"] : null);
  return published && /^https?:\/\//i.test(published) ? published : null;
}

/**
 * Prove an event record solely from a retained first-party detail document.
 *
 * The canonical URL is accepted as the source_record_id only where the
 * document itself publishes it and it agrees with the JSON-LD Event URL (if
 * supplied). This deliberately rejects listing/category documents whose
 * JSON-LD merely links out to an event page.
 *
 * BEATMAPPED-JSON-LD-SELF-REFERENTIAL-EVENT-URL-IDENTITY-01 added exactly one
 * additive identity basis, in strict preference order:
 *
 *   1. SOURCE_PUBLISHED_CANONICAL_EVENT_URL         (preferred, unchanged)
 *   2. SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL  (only when NO canonical
 *      is declared at all, and the Event node's own source-published
 *      ABSOLUTE `url` identifies the fetched document itself)
 *
 * A document that declares a canonical never reaches (2) — whether that
 * canonical agrees, disagrees, or is unreadable. No proof threshold, cutoff,
 * event-acceptance or collision rule is relaxed by (2); it widens only where
 * the identity may come from. Measured on the Berlin IP-1 cohort: hostname-
 * free, and it cannot engage at all for sources whose pages publish a
 * canonical (b-flat, privatclub, huxleys) or carry no Event node
 * (radialsystem, konzerthaus).
 */
/**
 * `listingRecords` (optional) — the ALREADY-NORMALIZED listing records
 * (e.g. from collectStaticCardEvents), each carrying its own claimed
 * `event_url`/`title`/`start_raw`. Only used by
 * canonicalTextCorroboratedProofs() below, as the SECOND independent
 * source a detail page's own extracted title/date text must genuinely
 * agree with — never consulted by canonicalProofs()/selfReferentialProofs(),
 * whose own JSON-LD-based identity is completely unchanged.
 */
export function proveCanonicalDetailEvents(documents, { cutoffDate, listingRecords = [] } = {}) {
  const cutoff = cutoffDate ?? null;
  const proofs = [];
  for (const document of documents ?? []) {
    const documentUrl = absoluteUrl(document?.url, document?.url);
    if (!documentUrl) continue;
    const canonicalUrl = canonicalUrlFromHtml(document?.body, documentUrl);

    // A published canonical stays authoritative, exactly as before. It is
    // never bypassed, and a self-referential Event URL never rescues a
    // document whose canonical is present but disagrees.
    if (canonicalUrl) {
      if (canonicalUrl !== documentUrl) continue;
      const jsonLdProofs = canonicalProofs(document, documentUrl, canonicalUrl, cutoff);
      // BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a FALLBACK
      // only: real structured JSON-LD evidence is never displaced by text
      // corroboration when both are present on the same document.
      proofs.push(...(jsonLdProofs.length ? jsonLdProofs : canonicalTextCorroboratedProofs(document, documentUrl, canonicalUrl, cutoff, listingRecords)));
      continue;
    }

    // A canonical the publisher DECLARED but we could not read is not an
    // absent canonical — reject it exactly as today.
    if (canonicalLinkDeclared(document?.body)) continue;
    proofs.push(...selfReferentialProofs(document, documentUrl, cutoff));
  }
  return [...new Map(proofs.map((proof) => [proof.source_record_id, proof])).values()];
}

/**
 * The pre-existing canonical proof, with one narrowing added by
 * BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03: the Event
 * node's own `url` disagreeing with the page's self-matching canonical
 * only rejects the proof when that URL is on the SAME origin as the
 * document — the real "this JSON-LD actually belongs to a different
 * page on this site" listing-page risk the check exists to catch (see
 * this function's own original doc comment above canonicalProofs, and
 * sameOrigin()'s own comment). A cross-origin `url` (a third-party
 * ticketing platform, e.g. fatsoma.com) does not indicate that risk at
 * all — the canonical-matches-itself check already independently
 * proved this document is about exactly one event — so it no longer
 * blocks the proof. Every other requirement (title, date, cutoff,
 * canonical-matches-document) is completely unchanged.
 */
function canonicalProofs(document, documentUrl, canonicalUrl, cutoff) {
  const proofs = [];
  for (const node of extractEventNodes(document.body)) {
    const title = nonEmpty(node?.name);
    const startRaw = nonEmpty(node?.startDate);
    const nodeUrl = absoluteUrl(typeof node?.url === "string" ? node.url : node?.url?.url, documentUrl);
    const jsonLdId = absoluteUrl(node?.["@id"], documentUrl);
    const nodeUrlDisagreesSameOrigin = nodeUrl && nodeUrl !== canonicalUrl && sameOrigin(nodeUrl, canonicalUrl);
    if (!title || !startRaw || nodeUrlDisagreesSameOrigin) continue;
    const date = proofDateFromStartDate(startRaw);
    if (cutoff && (!date || date < cutoff)) continue;
    proofs.push({
      title,
      start_raw: startRaw,
      source_record_id: canonicalUrl,
      event_url: canonicalUrl,
      source_document_url: documentUrl,
      source_document_canonical_url: canonicalUrl,
      json_ld_event_url: nodeUrl,
      json_ld_id: jsonLdId,
      source_record_id_basis: "SOURCE_PUBLISHED_CANONICAL_EVENT_URL",
      proof_kind: "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT",
    });
  }
  return proofs;
}

/**
 * BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a THIRD
 * identity basis, for a detail document that has NO JSON-LD Event node
 * at all (canonicalProofs() found nothing), but DOES declare a
 * canonical link matching its own fetched URL — the SAME "this document
 * is genuinely, first-party, about one specific thing" guarantee
 * canonicalProofs() already relies on. A real Manchester venue (The
 * Bridgewater Hall) publishes real, genuine, server-rendered detail
 * pages with a self-matching canonical, a real <h1>/og:title, and real
 * human-readable date text — but zero structured markup of any kind.
 *
 * The safety property this preserves is IDENTICAL to the JSON-LD bases:
 * two INDEPENDENTLY FETCHED, first-party documents (the listing page and
 * this detail page) must genuinely agree, not merely "trust the
 * listing". This is never a "title+date-only guess" from a single
 * source — it requires:
 *   1. the detail document's OWN canonical to self-match (proves this is
 *      a genuine detail page, not a listing/category page);
 *   2. a listing record that already claimed THIS EXACT canonical URL as
 *      its own event_url (so the two documents are talking about the
 *      SAME candidate identity, never guessed/paired up);
 *   3. the detail page's OWN extracted title (from its own <h1> or
 *      og:title — never the listing's title, which is not independent
 *      evidence of anything) to match, deterministically (normalised
 *      text equality, never fuzzy/similarity scoring), what the listing
 *      independently claimed;
 *   4. the detail page's OWN extracted date text (reusing
 *      static-cards/card-date.mjs's SAME no-year-invention parser
 *      already proven elsewhere in this project) to resolve to the SAME
 *      calendar date the listing independently claimed.
 * Any one of these failing means NO proof — never a partial/best-effort
 * proof, and never silently falling back to trusting the listing alone.
 */
const H1_TITLE = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
const OG_TITLE = /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i;

function plainText(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/\s+/g, " ").trim();
}

function extractDetailTitle(body) {
  const h1 = H1_TITLE.exec(body ?? "");
  if (h1) { const text = plainText(h1[1]); if (text) return text; }
  const og = OG_TITLE.exec(body ?? "");
  return og ? plainText(og[1]) : null;
}

function normaliseForCompare(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function canonicalTextCorroboratedProofs(document, documentUrl, canonicalUrl, cutoff, listingRecords) {
  const listingRecord = (listingRecords ?? []).find((record) => absoluteUrl(record?.event_url, documentUrl) === canonicalUrl);
  if (!listingRecord) return [];

  const listingTitle = nonEmpty(listingRecord.title);
  const listingStartRaw = nonEmpty(listingRecord.start_raw);
  if (!listingTitle || !listingStartRaw) return [];
  const listingDate = proofDateFromStartDate(listingStartRaw) ?? parseCompleteCardDate(listingStartRaw)?.iso ?? null;
  if (!listingDate) return [];
  if (cutoff && listingDate < cutoff) return [];

  const detailTitle = extractDetailTitle(document.body);
  if (!detailTitle || normaliseForCompare(detailTitle) !== normaliseForCompare(listingTitle)) return [];

  const detailDate = parseCompleteCardDate(document.body)?.iso ?? null;
  if (!detailDate || detailDate !== listingDate) return [];

  return [{
    title: listingTitle,
    start_raw: listingStartRaw,
    source_record_id: canonicalUrl,
    event_url: canonicalUrl,
    source_document_url: documentUrl,
    source_document_canonical_url: canonicalUrl,
    json_ld_event_url: null,
    json_ld_id: null,
    source_record_id_basis: "CANONICAL_DETAIL_TEXT_CORROBORATION",
    proof_kind: "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT",
  }];
}

/**
 * The one additive identity basis: a detail document that publishes NO
 * canonical, carrying a JSON-LD Event whose own source-published absolute
 * `url` identifies that very document.
 *
 * Every existing Event/date/cutoff requirement still applies unchanged — this
 * widens only WHERE the identity may come from, never WHAT makes an event
 * acceptable.
 *
 * Self-referentiality is what replaces the guarantee the canonical link was
 * providing: it is the source itself asserting "this document is this event".
 * That is also why a listing document can never be promoted here — its Event
 * nodes point outward, at other pages, and fail this test.
 */
function selfReferentialProofs(document, documentUrl, cutoff) {
  const eligible = [];
  for (const node of extractEventNodes(document.body)) {
    const title = nonEmpty(node?.name);
    const startRaw = nonEmpty(node?.startDate);
    const selfUrl = selfReferentialEventUrl(node, documentUrl);
    if (!title || !startRaw || !selfUrl) continue;
    const date = proofDateFromStartDate(startRaw);
    if (cutoff && (!date || date < cutoff)) continue;
    eligible.push({ title, startRaw, selfUrl, jsonLdId: publishedAbsoluteId(node) });
  }

  // Identity here is the document's own URL, so two Event nodes each claiming
  // to BE this document would mint one identity for two different events —
  // the dedupe below would silently keep whichever came last. That is an
  // ambiguous document, not a detail page: reject it whole rather than
  // guessing which event it identifies.
  if (eligible.length !== 1) return [];

  const [only] = eligible;
  return [{
    title: only.title,
    start_raw: only.startRaw,
    source_record_id: only.selfUrl,
    event_url: only.selfUrl,
    source_document_url: documentUrl,
    // Honestly null: this proof exists precisely because none was published.
    source_document_canonical_url: null,
    json_ld_event_url: only.selfUrl,
    json_ld_id: only.jsonLdId,
    source_record_id_basis: "SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL",
    proof_kind: "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT",
  }];
}
