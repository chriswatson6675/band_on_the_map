// new-morning-paris-01 — offline derivation proof (policy v1.2 gate 9 /
// gate 4-5 refinement). Bounded, dependency-free, NO-NETWORK script. It
// re-parses ONLY this investigation's own retained fixture
// (evidence/home-raw.html) and reuses the EXISTING, UNMODIFIED
// ingestion/json-ld/parse.mjs's normaliseJsonLdEvent() for field
// normalisation.
//
// This source's own homepage JSON-LD Event array is genuinely malformed
// (two real, independent site bugs, not invented by this investigation):
//   (1) a missing comma between adjacent object properties in some event
//       records (e.g. between a nested "organizer": {...} block and the
//       following "description" key) — a structural bug;
//   (2) literal, unescaped control characters (raw newlines) embedded
//       inside JSON string values (e.g. inside "description" text) — a
//       string-content bug.
// Neither is fixable by the SAME one-line change that fixed Tempodrom
// Berlin's unquoted `<script type=application/ld+json>` attribute — this
// is genuinely more than a one-line existing-parser widening, so this
// investigation's collector_assessment honestly documents it as a real,
// if still bounded and generic, repair-pass requirement rather than
// pretending it is zero-code. The repair logic below exists ONLY to prove
// that requirement is genuinely satisfiable, deterministically and
// offline, against the retained fixture — it must never become (or be
// copy-pasted verbatim into) a production collector; see this
// investigation's own README.md and investigation.json.
//
// Run: node research/source-investigations/new-morning-paris-01/evidence/offline-proof.mjs

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normaliseJsonLdEvent } from "../../../../ingestion/json-ld/parse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) {
    console.error(`OFFLINE PROOF: FAILED — ${message}`);
    process.exit(1);
  }
}

/**
 * Escape raw (unescaped) control characters that appear INSIDE a JSON
 * string literal. A simple, generic single-pass scanner: tracks whether
 * we are currently inside a string (toggled by an unescaped double quote)
 * and whether the previous character was a backslash (so an escaped quote
 * `\"` does not toggle string state). This never touches structural
 * whitespace outside string literals.
 */
function escapeRawControlCharsInStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
    }
  }
  return out;
}

/**
 * Insert a missing comma between two adjacent JSON object/array
 * properties where the source genuinely omitted one (observed bug:
 * `"organizer": {...}` directly followed by whitespace/newline then the
 * next `"key":` with no comma at all). Only fires when a `}` is NOT
 * already followed by a comma before the next quoted key — a correctly
 * comma'd pair is left untouched.
 */
function insertMissingCommas(text) {
  return text.replace(/\}(?!\s*,)(\s*\n\s*)"/g, '},$1"');
}

async function main() {
  const html = await readFile(resolve(HERE, "home-raw.html"), "utf8");

  const blockMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert(blockMatches.length === 3, `expected 3 JSON-LD blocks on the retained fixture, got ${blockMatches.length}`);

  const eventArrayRaw = blockMatches[2][1];

  // Confirm the raw fixture genuinely does NOT parse as-is (documenting
  // the real bug, not merely asserting it).
  let rawParseFailed = false;
  try {
    JSON.parse(eventArrayRaw);
  } catch {
    rawParseFailed = true;
  }
  assert(rawParseFailed, "expected the raw retained JSON-LD array to fail JSON.parse (documenting the site's own bug)");

  const repaired = insertMissingCommas(escapeRawControlCharsInStrings(eventArrayRaw));
  const events = JSON.parse(repaired); // throws (fails this proof) if repair is insufficient

  assert(Array.isArray(events) && events.length === 72, `expected 72 repaired Event records, got ${events.length}`);

  const sample = events.find((e) => e.name === "A Stevie Wonder Celebration, Songs In The Key Of Life 50th Anniversary");
  assert(sample, "expected to find the sampled event by name after repair");
  assert(sample["@type"] === "Event", `unexpected @type: ${sample["@type"]}`);

  const deriveId = (n) => {
    const match = /\/(\d{8}-\d+-[a-z0-9-]+)\.html$/.exec(n.url ?? "");
    if (!match) throw new Error("could not derive source_record_id from event_url");
    return match[1];
  };

  const normalised = normaliseJsonLdEvent(sample, { deriveId });

  assert(normalised.title === "A Stevie Wonder Celebration, Songs In The Key Of Life 50th Anniversary", `unexpected title: ${normalised.title}`);
  assert(normalised.start_raw === "2026-09-11T00:00:00", `unexpected start_raw: ${normalised.start_raw}`);
  assert(normalised.end_raw === "2026-09-11T23:30:00", `unexpected end_raw: ${normalised.end_raw}`);
  assert(normalised.location_name === "New Morning", `unexpected location_name: ${normalised.location_name}`);
  assert(
    normalised.location_address?.streetAddress === "7-9, Rue des Petites Ecuries" &&
      normalised.location_address?.postalCode === "75010" &&
      normalised.location_address?.addressLocality === "Paris",
    `unexpected location_address: ${JSON.stringify(normalised.location_address)}`,
  );
  assert(
    normalised.event_url ===
      "https://www.newmorning.com/20260911-7789-a-stevie-wonder-celebration-songs-in-the-key-of-life-50th-anniversary.html",
    `unexpected event_url: ${normalised.event_url}`,
  );
  assert(
    normalised.source_record_id === "20260911-7789-a-stevie-wonder-celebration-songs-in-the-key-of-life-50th-anniversary",
    `unexpected source_record_id: ${normalised.source_record_id}`,
  );

  console.log("OFFLINE PROOF: PASSED");
  console.log(
    JSON.stringify(
      {
        raw_fixture_parse_failed_as_expected: true,
        repaired_event_count: events.length,
        title: normalised.title,
        start_date: "2026-09-11",
        start_raw: normalised.start_raw,
        end_raw: normalised.end_raw,
        venue_location: `${normalised.location_name}, ${normalised.location_address.streetAddress}, ${normalised.location_address.postalCode} ${normalised.location_address.addressLocality}, ${normalised.location_address.addressCountry}`,
        source_record_id: normalised.source_record_id,
        event_url: normalised.event_url,
      },
      null,
      2,
    ),
  );
}

main();
