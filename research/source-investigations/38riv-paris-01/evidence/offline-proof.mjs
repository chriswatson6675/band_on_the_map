// 38riv-paris-01 — offline derivation proof (policy v1.2 gate 9 / gate 4-5
// refinement). Bounded, dependency-free, NO-NETWORK script. It re-parses
// ONLY this investigation's own retained fixtures
// (evidence/concerts-raw.html, evidence/detail-carte-blanche-hermon-mehari-1-raw.html)
// using the EXISTING, UNMODIFIED shared collector modules
// (ingestion/html-link-discovery/discovery.mjs, ingestion/json-ld/parse.mjs)
// — it imports those modules but edits neither of them, per this
// investigation's own PARIS_EXISTING_FAMILY_WITH_SMALL_FIX classification
// (a real venue-specific collector, if built, is separate, later,
// explicitly-authorised work; this script exists only to prove the
// acquisition path is genuinely reproducible offline, never to become a
// production collector itself).
//
// Run: node research/source-investigations/38riv-paris-01/evidence/offline-proof.mjs

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractLinksMatching } from "../../../../ingestion/html-link-discovery/discovery.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../../../../ingestion/json-ld/parse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) {
    console.error(`OFFLINE PROOF: FAILED — ${message}`);
    process.exit(1);
  }
}

async function main() {
  // --- Step 1: link discovery on the retained listing page fixture ---
  const listingHtml = await readFile(resolve(HERE, "concerts-raw.html"), "utf8");
  const links = extractLinksMatching(listingHtml, /href="(\/en\/concerts\/[a-z0-9-]+)"/g, {
    baseUrl: "https://38riv.com",
  });
  assert(links.length === 24, `expected 24 distinct detail links, got ${links.length}`);
  assert(
    links.includes("https://38riv.com/en/concerts/carte-blanche-hermon-mehari-1"),
    "expected the sampled detail link to be discovered from the listing page",
  );

  // --- Step 2: JSON-LD extraction on the retained detail-page fixture ---
  // The site's own detail-page JSON-LD is @type "EventSeries" (not the
  // module's default "Event"/"MusicEvent" set) — this is the one, purely
  // caller-side configuration difference this investigation's "small fix"
  // note refers to: widening the `types` option already exposed by
  // extractEventNodes(), not editing ingestion/json-ld/parse.mjs itself.
  const detailHtml = await readFile(
    resolve(HERE, "detail-carte-blanche-hermon-mehari-1-raw.html"),
    "utf8",
  );
  const nodes = extractEventNodes(detailHtml, { types: new Set(["Event", "MusicEvent", "EventSeries"]) });
  assert(nodes.length === 1, `expected exactly 1 top-level EventSeries node, got ${nodes.length}`);

  const node = nodes[0];
  assert(node["@type"] === "EventSeries", `expected @type EventSeries, got ${node["@type"]}`);

  const deriveId = (n) => {
    const match = /\/en\/concerts\/([a-z0-9-]+)$/.exec(n.url ?? "");
    if (!match) throw new Error("could not derive source_record_id from event_url");
    return match[1];
  };

  const normalised = normaliseJsonLdEvent(node, { deriveId });

  assert(normalised.title === "Carte blanche to Hermon Mehari", `unexpected title: ${normalised.title}`);
  assert(normalised.start_raw === "2026-08-27T19:30:00+02:00", `unexpected start_raw: ${normalised.start_raw}`);
  assert(normalised.end_raw === "2026-08-27T21:30:00+02:00", `unexpected end_raw: ${normalised.end_raw}`);
  assert(normalised.location_name === "38Riv", `unexpected location_name: ${normalised.location_name}`);
  assert(
    normalised.location_address?.streetAddress === "38 Rue de Rivoli" &&
      normalised.location_address?.postalCode === "75004" &&
      normalised.location_address?.addressLocality === "Paris",
    `unexpected location_address: ${JSON.stringify(normalised.location_address)}`,
  );
  assert(
    normalised.event_url === "https://38riv.com/en/concerts/carte-blanche-hermon-mehari-1",
    `unexpected event_url: ${normalised.event_url}`,
  );
  assert(
    normalised.source_record_id === "carte-blanche-hermon-mehari-1",
    `unexpected source_record_id: ${normalised.source_record_id}`,
  );
  // Honest, documented gap: the top-level EventSeries node carries no
  // top-level "offers" field itself (price is only present nested inside
  // subEvent[].offers) — normaliseJsonLdEvent's offerPriceText() only
  // reads node.offers, so price_text is null via this zero-code path. This
  // is exactly the "small fix" (a subEvent-flattening addition to
  // extractJsonLdNodes, mirroring its existing @graph/ItemList handling)
  // this investigation's field_assessment.price documents rather than
  // silently promising more than the generic path currently delivers.
  assert(normalised.price_text === null, `expected price_text null via the zero-code path, got ${normalised.price_text}`);

  console.log("OFFLINE PROOF: PASSED");
  console.log(
    JSON.stringify(
      {
        discovered_link_count: links.length,
        sample_link_included: true,
        title: normalised.title,
        start_date: "2026-08-27",
        start_raw: normalised.start_raw,
        end_raw: normalised.end_raw,
        venue_location: `${normalised.location_name}, ${normalised.location_address.streetAddress}, ${normalised.location_address.postalCode} ${normalised.location_address.addressLocality}, ${normalised.location_address.addressCountry}`,
        source_record_id: normalised.source_record_id,
        event_url: normalised.event_url,
        price_text: normalised.price_text,
      },
      null,
      2,
    ),
  );
}

main();
