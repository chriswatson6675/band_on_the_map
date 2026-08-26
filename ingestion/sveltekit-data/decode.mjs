// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — a small,
// generic decoder for the "devalue" flat-array encoding SvelteKit's own
// `+page.js`/`+layout.js` `load()` route data uses in its `__data.json`
// endpoint (https://kit.svelte.dev/docs/load#making-fetch-requests —
// SvelteKit's documented, first-party route-data convention, not a
// private/undocumented API). First observed live on Bi Nuu's own
// `/de/events/__data.json` (see
// research/source-investigations/bi-nuu-berlin-01/) but this module is
// deliberately source-agnostic — any future SvelteKit-built Berlin (or
// other) source's own `__data.json` reuses this unchanged.
//
// The encoding: a flat JSON array where every object/array VALUE is
// itself an index into the SAME array (never literal nested data) — this
// is what makes the format flat/circular-reference-safe on the wire.
// Decoding is one small, generic, recursive index-resolution function;
// it has no notion of "events" or any other domain concept.
//
// This module performs no network I/O and no field-specific mapping —
// see the caller (a per-source discovery/observation-adapter) for that.

/**
 * Resolve one devalue reference (an index into `flatArray`) into its
 * real value, recursively resolving every nested object/array reference.
 * A primitive value (string/number/boolean/null) at that index is
 * returned as-is. Detects and throws on a genuine circular reference
 * (which a well-formed devalue payload should never contain) rather than
 * infinite-looping.
 */
export function resolveDevalueRef(flatArray, ref, seen = new Set()) {
  if (!Array.isArray(flatArray)) {
    throw new Error("resolveDevalueRef requires a flat array");
  }
  if (ref === undefined || ref === null) return null;
  const raw = flatArray[ref];
  if (raw === null || typeof raw !== "object") return raw;

  if (seen.has(ref)) {
    throw new Error(`circular devalue reference detected at index ${ref}`);
  }
  const nextSeen = new Set(seen);
  nextSeen.add(ref);

  if (Array.isArray(raw)) {
    return raw.map((childRef) => resolveDevalueRef(flatArray, childRef, nextSeen));
  }
  const result = {};
  for (const [key, childRef] of Object.entries(raw)) {
    result[key] = resolveDevalueRef(flatArray, childRef, nextSeen);
  }
  return result;
}

/**
 * Decode one already-fetched SvelteKit `__data.json` response body (a
 * `{ type: "data", nodes: [...] }` envelope) into its resolved `data`
 * payload for one given node index (SvelteKit numbers one node per
 * route segment; `nodeIndex` defaults to `1`, the leaf/page node — index
 * `0` is conventionally the root layout and is usually `null` when it
 * contributes no data of its own, matching every real sample retained in
 * this trial).
 */
export function decodeSvelteKitData(responseText, { nodeIndex = 1 } = {}) {
  if (typeof responseText !== "string" || responseText.trim() === "") {
    throw new Error("Expected non-empty __data.json response text");
  }
  const envelope = JSON.parse(responseText);
  if (envelope?.type !== "data" || !Array.isArray(envelope.nodes)) {
    throw new Error('Expected a SvelteKit __data.json envelope ({ type: "data", nodes: [...] })');
  }
  const node = envelope.nodes[nodeIndex];
  if (!node || node.type !== "data" || !Array.isArray(node.data)) {
    throw new Error(`nodes[${nodeIndex}] is not a well-formed devalue data node`);
  }
  return resolveDevalueRef(node.data, 0);
}
