// BOTM-PUBLIC-MAP-LIVE-DATA-01 — the ONLY module permitted to write the
// committed product publication artifact,
// data/public/lisbon-porto-map.json. This file owns exactly two
// responsibilities: where the canonical path lives, and how a write to it
// is made safe. It never decides WHAT goes in the artifact — that is
// ingestion/map/publication.mjs's job (buildPublicationArtifact()); this
// module only ever receives an already-built artifact object.
//
// ATOMIC PUBLICATION RULE: temporary sibling -> validate -> atomic
// rename. validatePublicationArtifact() (ingestion/map/publication.mjs)
// runs BEFORE any temp file is even opened — a failing artifact is
// refused immediately, so the previously committed, valid artifact is
// NEVER observed partially written and NEVER replaced by a broken one.
// On success, the temp file is renamed onto the canonical path (rename is
// atomic on the same filesystem, matching the exact convention already
// used by ingestion/geocoding/manual-coordinate-store.mjs's
// writeStoreAtomic) — no abandoned temp file is ever left behind.
//
// This module resolves the canonical path from THIS FILE'S OWN LOCATION
// (import.meta.url, walking up to the repository root) — never from
// process.cwd() — matching the same convention already established by
// ingestion/geocoding/manual-coordinate-store.mjs.

import { mkdir, open, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { validatePublicationArtifact } from "./publication.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolvePublicationArtifactPath({ root = ROOT } = {}) {
  return resolve(root, "data/public/lisbon-porto-map.json");
}

/**
 * Validate, then atomically write, the publication artifact. Returns
 * `{ ok: true, path }` on success, or `{ ok: false, errors }` (schema
 * validation failed — nothing was written, the previously committed file
 * at `path` is completely untouched) without ever throwing for an
 * ordinary validation failure. A genuine filesystem error (e.g. an
 * unwritable directory) still throws, matching this repository's existing
 * convention for I/O failures elsewhere (e.g.
 * manual-coordinate-store.mjs).
 */
export async function writePublicationArtifactAtomic(artifact, { root = ROOT } = {}) {
  const errors = validatePublicationArtifact(artifact);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const path = resolvePublicationArtifactPath({ root });
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = resolve(dirname(path), `.lisbon-porto-map.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

  const handle = await open(tmpPath, "w");
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, path);

  return { ok: true, path };
}

export { ROOT as PUBLICATION_ARTIFACT_ROOT };
