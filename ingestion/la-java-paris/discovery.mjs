// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — bespoke collector for La
// Java's own official '/programmation' page (https://la-java.fr/programmation),
// a Next.js app that streams its full event list as a React Server
// Component ("RSC") payload embedded directly in the initial HTML response
// via repeated `<script>self.__next_f.push([1,"..."])</script>` tags — no
// separate client-side XHR/fetch is needed to see the data; it is already
// present, first-party, in the byte-for-byte HTML this collector fetches.
//
// One of those push calls carries a JS string literal whose UNESCAPED
// content contains `"events":[ ... ]` — a JSON array of this venue's own
// full near-term event list, each with a stable `id`, `name`, a full ISO
// `date` string, `type` ("concert"/"club"), `poster`, and a first-party-
// selected `ticketUrl` (this venue's own outbound choice of ticketing
// partner, currently Shotgun — a third-party checkout domain, but the
// choice/URL itself is directly authored by La Java's own page, not
// scraped from Shotgun).
//
// Distinct from ingestion/sveltekit-data/ (a different framework's own
// streaming-data convention) — this is Next.js's own React Flight
// wire format, not SvelteKit's `__data.json`. This module performs no
// network I/O; it only parses already-fetched HTML text.

/**
 * Match one `self.__next_f.push([1,"..."])` call's raw (still JS-string-
 * escaped) payload. The alternation `(?:\\.|[^"\\])*` is the standard,
 * correct way to match "everything up to the real closing quote" of a JS
 * string literal that may itself contain escaped quotes/backslashes —
 * never truncates early on an embedded `\"`.
 */
const NEXT_F_PUSH_RE = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;

/**
 * Extract this page's own embedded `events` array (a real, first-party
 * JSON array — id/name/date/type/poster/ticketUrl/description), by
 * scanning every `self.__next_f.push` chunk for one whose unescaped
 * content contains an `"events":[` marker, then bracket-matching to the
 * array's own closing `]` (never a naive regex over nested JSON). Throws
 * if no such chunk is found — never silently returns a fabricated empty
 * list when the page's own shape has changed.
 */
export function extractEmbeddedEvents(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty La Java programmation page HTML");
  }

  let match;
  NEXT_F_PUSH_RE.lastIndex = 0;
  while ((match = NEXT_F_PUSH_RE.exec(html)) !== null) {
    let unescaped;
    try {
      unescaped = JSON.parse(`"${match[1]}"`);
    } catch {
      continue; // not a valid JS string literal body — not our chunk
    }
    const marker = '"events":[';
    const markerIndex = unescaped.indexOf(marker);
    if (markerIndex === -1) continue;

    const start = markerIndex + '"events":'.length;
    let depth = 0;
    let end = -1;
    for (let i = start; i < unescaped.length; i += 1) {
      const c = unescaped[i];
      if (c === "[") depth += 1;
      else if (c === "]") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) continue; // unbalanced — not a well-formed array, skip this chunk

    return JSON.parse(unescaped.slice(start, end));
  }

  throw new Error("No self.__next_f.push chunk containing an \"events\":[ array was found");
}
