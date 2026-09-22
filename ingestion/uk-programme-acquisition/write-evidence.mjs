// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — the only place
// this package's investigation evidence is ever written to disk, always
// under research/source-investigations/<source_id>/evidence/ (the
// governed root ingestion/source-investigation/contract.mjs's
// isGovernedEvidencePath() requires). Every path this module returns is
// checked against that function before use in tests, and every
// investigation.json this package writes is itself validated by
// validateInvestigation() before being persisted — see run.mjs.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

function extensionFor(contentType) {
  if (!contentType) return "html";
  if (contentType.includes("json")) return "json";
  if (contentType.includes("xml") || contentType.includes("calendar")) return "ics";
  return "html";
}

/**
 * Write the bounded set of REAL documents acquireSource() actually
 * fetched (see investigation-writer.mjs's selectEvidenceDocuments()) to
 * disk, and return their evidence metadata for buildInvestigationRecord().
 * `documents` may legitimately be empty (nothing was ever fetched) — the
 * caller (run.mjs) is responsible for calling writeAttemptLog() instead in
 * that case; this function never invents a placeholder.
 */
export async function writeEvidenceFiles({ root, sourceId, documents, labels }) {
  if (documents.length === 0) return [];
  const dir = resolve(root, "research/source-investigations", sourceId, "evidence");
  await mkdir(dir, { recursive: true });

  const meta = [];
  for (let index = 0; index < documents.length; index += 1) {
    const doc = documents[index];
    const label = labels?.[index] ?? `document-${index + 1}`;
    const filename = `${String(index + 1).padStart(2, "0")}-${label}.${extensionFor(doc.content_type)}`;
    const fullPath = resolve(dir, filename);
    await writeFile(fullPath, doc.body ?? "", "utf8");
    meta.push({
      evidence_id: `ev-${index + 1}`,
      url: doc.url,
      description: `${label} (HTTP ${doc.status}) retained verbatim from a passive, unauthenticated GET.`,
      content_type: doc.content_type ?? null,
      acquired_at: doc.at,
      path: relative(root, fullPath).replace(/\\/g, "/"),
    });
  }
  return meta;
}

/**
 * A source whose very first fetch failed before any bytes were received
 * (e.g. DNS failure, connection refused, timeout exhausted across every
 * retry) still needs at least one real, retained evidence item — see
 * investigation-writer.mjs's own doc comment on why a path-less
 * placeholder cannot satisfy validateInvestigation(). This writes one
 * small, honest, timestamped record of the attempt itself.
 */
export async function writeAttemptLog({ root, sourceId, url, attemptedAt, error }) {
  const dir = resolve(root, "research/source-investigations", sourceId, "evidence");
  await mkdir(dir, { recursive: true });
  const fullPath = resolve(dir, "01-attempt-log.json");
  const payload = { url, attempted_at: attemptedAt, error: String(error) };
  await writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return [{
    evidence_id: "ev-1",
    url,
    description: `A retained record of the attempted fetch itself: no response was ever received (${String(error)}).`,
    content_type: "application/json",
    acquired_at: attemptedAt,
    path: relative(root, fullPath).replace(/\\/g, "/"),
  }];
}
