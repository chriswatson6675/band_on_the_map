// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Le Bataclan's own bespoke
// discovery module. See research/source-investigations/le-bataclan-paris-01/.
//
// Le Bataclan's own /programmation/ page is a Nuxt 3 (SSR) build. The
// static HTML shell alone does not carry the event listing (Level 1
// PASSIVE_STATIC: INSUFFICIENT) — but the page's own <script data-src="...">
// tag publicly references a static, discoverable JSON data endpoint,
// /programmation/_payload.json, confirmed live to return the SAME full
// content with or without its query-string build hash (Level 2 STRUCTURAL:
// SUFFICIENT). That payload is Nuxt's own "devalue" flat-array wire format
// — the SAME general encoding SvelteKit's own __data.json convention uses
// (a flat array where every object/array VALUE is itself an index into
// the same array). This module REUSES the existing, generic, source-
// agnostic ingestion/sveltekit-data/decode.mjs's resolveDevalueRef()
// unchanged for that low-level index-resolution step; only the Nuxt-
// specific envelope navigation and event-record mapping below are new,
// bespoke code for this source.
//
// One Nuxt-specific wrinkle resolveDevalueRef() (built for SvelteKit's
// plainer envelope) does not itself understand: Nuxt additionally tags
// some values with a reactivity wrapper, e.g. ["ShallowReactive", 7] at
// the root ("data") slot. resolveDevalueRef() has no notion of this tag
// and resolves the pair as a literal 2-element array [undefined-or-tag,
// resolvedValue] — so root.data[1] (not root.data itself) is this
// payload's real page-data object. This module only unwraps that ONE
// documented, retained, empirically-confirmed shape; it does not attempt
// to generically support every possible Nuxt/devalue reducer tag.

import { resolveDevalueRef } from "../sveltekit-data/decode.mjs";

/**
 * Decode one already-fetched Nuxt `_payload.json` response body into its
 * resolved page-data object (unwrapping the one ["ShallowReactive", ref]
 * root wrapper this source's own retained payload uses — see module doc
 * comment above).
 */
export function decodeBataclanPayload(responseText) {
  if (typeof responseText !== "string" || responseText.trim() === "") {
    throw new Error("Expected non-empty Bataclan _payload.json response text");
  }
  const flatArray = JSON.parse(responseText);
  if (!Array.isArray(flatArray)) {
    throw new Error("Expected a Nuxt devalue flat array at the payload's top level");
  }
  const root = resolveDevalueRef(flatArray, 0);
  const pageData = root?.data?.[1];
  if (!pageData || typeof pageData !== "object") {
    throw new Error("Expected root.data[1] to be this payload's real page-data object (ShallowReactive unwrap)");
  }
  return pageData;
}

/**
 * Extract every raw event record from an already-decoded page-data object
 * (see decodeBataclanPayload above). Never throws on zero matches — a
 * genuinely empty listing is legitimate.
 */
export function extractEventRecords(pageData) {
  const events = pageData?.events?.data;
  if (!Array.isArray(events)) {
    throw new Error("Expected pageData.events.data to be an array");
  }
  return events;
}

/**
 * Decode a raw fetched response body straight to its raw event records —
 * the one function a live collector needs to call.
 */
export function extractEventRecordsFromPayloadText(responseText) {
  return extractEventRecords(decodeBataclanPayload(responseText));
}
