import { extractEventNodes } from "../json-ld/parse.mjs";
import { proofDateFromStartDate } from "./proof-date.mjs";

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
export function proveCanonicalDetailEvents(documents, { cutoffDate } = {}) {
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
      proofs.push(...canonicalProofs(document, documentUrl, canonicalUrl, cutoff));
      continue;
    }

    // A canonical the publisher DECLARED but we could not read is not an
    // absent canonical — reject it exactly as today.
    if (canonicalLinkDeclared(document?.body)) continue;
    proofs.push(...selfReferentialProofs(document, documentUrl, cutoff));
  }
  return [...new Map(proofs.map((proof) => [proof.source_record_id, proof])).values()];
}

/** The pre-existing canonical proof, unchanged. */
function canonicalProofs(document, documentUrl, canonicalUrl, cutoff) {
  const proofs = [];
  for (const node of extractEventNodes(document.body)) {
    const title = nonEmpty(node?.name);
    const startRaw = nonEmpty(node?.startDate);
    const nodeUrl = absoluteUrl(typeof node?.url === "string" ? node.url : node?.url?.url, documentUrl);
    const jsonLdId = absoluteUrl(node?.["@id"], documentUrl);
    if (!title || !startRaw || (nodeUrl && nodeUrl !== canonicalUrl)) continue;
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
