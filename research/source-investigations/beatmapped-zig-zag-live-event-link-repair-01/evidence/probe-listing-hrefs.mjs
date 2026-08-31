// BEATMAPPED-ZIG-ZAG-LIVE-EVENT-LINK-REPAIR-01, step 1 — bounded, live,
// single-GET reproduction of the real Zig Zag Jazz Club listing page's
// current href structure, proving that `linkPattern:
// /href="(\/program-mai\/[a-z0-9-]+)"/g` (ingestion/berlin/run.mjs's
// existing, unmodified collectZigZagJazzClub()) still matches the site's
// real, live path segment today — "program-mai" is this venue's own fixed
// Squarespace page slug, not a stale month-specific path as its name might
// suggest. Writes listing-hrefs.json (deduplicated href list) as retained
// evidence. No production code imported/executed here beyond the generic
// fetchText() helper.
import { fetchText } from "../../../../ingestion/http/fetch.mjs";
import { writeFileSync } from "node:fs";

const res = await fetchText("https://www.zigzag-jazzclub.berlin/menu-marquee", {});
console.log("status:", res.status, "ok:", res.ok, "bytes:", res.text.length, "url:", res.url);

const hrefMatches = [...res.text.matchAll(/href="([^"]*program[^"]*)"/gi)];
const unique = [...new Set(hrefMatches.map((m) => m[1]))];
console.log("unique hrefs containing 'program':", unique.length);

writeFileSync(
  new URL("./listing-hrefs.json", import.meta.url),
  `${JSON.stringify({ fetched_at: res.retrievedAt, list_url: "https://www.zigzag-jazzclub.berlin/menu-marquee", status: res.status, unique_program_hrefs: unique }, null, 2)}\n`,
);
console.log("wrote listing-hrefs.json");
