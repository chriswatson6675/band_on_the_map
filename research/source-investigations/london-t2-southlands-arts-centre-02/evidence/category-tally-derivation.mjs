// Bounded, dependency-free, no-network offline derivation script.
// Re-parses the retained fixture geodir-events-full-fixture.json (a
// reformatted-but-real retention of the site's own public
// /wp-json/geodir/v2/events?per_page=100 response, trimmed to essential
// fields) and deterministically tallies how many of the site's own
// current/future events each GeoDirectory category applies to.
//
// This exists only to PROVE the "1 of 33 events is tagged Music" claim in
// investigation.json is genuinely reproducible from retained evidence, not
// merely asserted -- it is not, and must never become, a production
// collector. Run with: node category-tally-derivation.mjs
//
// See docs/SOURCE_INVESTIGATION_POLICY.md "Offline derivation proof".

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "geodir-events-full-fixture.json");

const events = JSON.parse(readFileSync(fixturePath, "utf8"));

const tally = new Map();
const musicEvents = [];

for (const event of events) {
  for (const category of event.categories) {
    tally.set(category, (tally.get(category) ?? 0) + 1);
  }
  if (event.categories.includes("Music")) {
    musicEvents.push(event.title);
  }
}

const result = {
  total_events: events.length,
  category_tally: Object.fromEntries([...tally.entries()].sort((a, b) => b[1] - a[1])),
  music_tagged_events: musicEvents,
  music_share: `${musicEvents.length} of ${events.length}`,
};

console.log(JSON.stringify(result, null, 2));
