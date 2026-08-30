import { extractEventNodes } from "../json-ld/parse.mjs";

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

/**
 * Prove an event record solely from a retained first-party detail document.
 *
 * The canonical URL is accepted as the source_record_id only where the
 * document itself publishes it and it agrees with the JSON-LD Event URL (if
 * supplied). This deliberately rejects listing/category documents whose
 * JSON-LD merely links out to an event page.
 */
export function proveCanonicalDetailEvents(documents, { cutoffDate } = {}) {
  const cutoff = cutoffDate ?? null;
  const proofs = [];
  for (const document of documents ?? []) {
    const documentUrl = absoluteUrl(document?.url, document?.url);
    const canonicalUrl = canonicalUrlFromHtml(document?.body, documentUrl);
    if (!documentUrl || !canonicalUrl || canonicalUrl !== documentUrl) continue;
    for (const node of extractEventNodes(document.body)) {
      const title = nonEmpty(node?.name);
      const startRaw = nonEmpty(node?.startDate);
      const nodeUrl = absoluteUrl(typeof node?.url === "string" ? node.url : node?.url?.url, documentUrl);
      const jsonLdId = absoluteUrl(node?.["@id"], documentUrl);
      if (!title || !startRaw || (nodeUrl && nodeUrl !== canonicalUrl)) continue;
      const date = /^\d{4}-\d{2}-\d{2}/.exec(startRaw)?.[0] ?? null;
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
  }
  return [...new Map(proofs.map((proof) => [proof.source_record_id, proof])).values()];
}
