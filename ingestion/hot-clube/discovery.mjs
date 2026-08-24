// Parses genuinely retrieved Hot Clube homepage HTML (the same
// EventON-rendered programme page proven in BOTM-ICS-01/01A) into small,
// structured per-event discovery records.
//
// This module is discovery-layer only, and deliberately narrow:
//   - it NEVER decides canonical identity. The stable identity used
//     throughout this project is, and remains, the EventON `event_id`
//     (see ingestion/hot-clube/observation-adapter.mjs) — this module
//     only ever extracts that same id from `data-event_id`/`id="event_
//     {id}"`, never invents one.
//   - it NEVER guesses or slugifies a permalink. Every returned
//     `event_url` is copied verbatim from that event's own rendered
//     container's `<a itemprop='url' href='...'>` — the same container
//     that carries its `data-event_id`, not a separately-matched or
//     title-derived value. If a container has no such attribute,
//     `event_url` is `null`.
//   - it does NOT decide whether a discovered permalink is *usable* as
//     an Observation's `event_url`. That is a separate, evidenced policy
//     decision — see docs/sources/HOT_CLUBE.md's "Individual Event
//     Permalinks" section and fixtures/hot-clube/discovery/
//     homepage-event-links.json's `permalink_verification` — because a
//     permalink can be genuinely first-party-evidenced and still not
//     resolve to distinct event content (this proof found every one of
//     the 9 retained samples redirects to the Hot Clube homepage).

const EVENT_CONTAINER_START_RE = /<div[^>]*\bid="event_(\d+)"[^>]*>/g;

function firstMatch(text, pattern) {
  const match = pattern.exec(text);
  return match ? match[1] : null;
}

/**
 * Split raw homepage HTML into one bounded window per event container,
 * keyed by event_id. A window runs from an event container's opening
 * tag to the next event container's opening tag (or a hard cap) — enough
 * to contain that event's own inline Schema.org microdata without
 * spilling into a neighbouring event's.
 */
function eventWindows(html, maxWindowLength = 4000) {
  const starts = [];
  const containerRe = new RegExp(EVENT_CONTAINER_START_RE);
  let match;
  while ((match = containerRe.exec(html))) {
    starts.push({ eventId: match[1], index: match.index });
  }

  return starts.map((start, i) => {
    const nextIndex = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const windowEnd = Math.min(nextIndex, start.index + maxWindowLength);
    return { eventId: start.eventId, window: html.slice(start.index, windowEnd) };
  });
}

/**
 * Parse one Hot Clube homepage HTML document into discovery records, one
 * per distinct event_id (the live page commonly renders the same event
 * more than once — e.g. in more than one view — so records are
 * deduplicated by event_id; the first occurrence's fields are kept).
 *
 * Each record: { event_id, event_url, title, start_raw, end_raw,
 * venue_name, location_address } — any field genuinely absent from that
 * event's container is null, never fabricated.
 */
export function parseHotClubeDiscovery(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Hot Clube homepage HTML");
  }

  const seen = new Set();
  const records = [];

  for (const { eventId, window } of eventWindows(html)) {
    if (seen.has(eventId)) continue;
    seen.add(eventId);

    records.push({
      event_id: eventId,
      event_url: firstMatch(window, /itemprop='url'\s+href='([^']*)'/),
      title: firstMatch(window, /itemprop='name'\s*>([^<]*)</),
      start_raw: firstMatch(window, /itemprop='startDate'\s+content='([^']*)'/),
      end_raw: firstMatch(window, /itemprop='endDate'\s+content='([^']*)'/),
      venue_name: firstMatch(window, /itemprop="location"[\s\S]{0,400}?itemprop="name">([^<]*)</),
      location_address: firstMatch(window, /itemprop="streetAddress">([^<]*)</),
    });
  }

  return records;
}

/**
 * Look up one event_id's discovery record from a parsed list. Returns
 * null (never a guessed/partial record) if that event_id was not found.
 */
export function findDiscoveryRecord(records, eventId) {
  return records.find((record) => record.event_id === String(eventId)) ?? null;
}

// LISBON-AUTOMATIC-SUBSET-01: the small additional discovery step a live
// collector genuinely needs — finding each event's own "Calendário" ICS
// download link (docs/sources/HOT_CLUBE.md's proven
// admin-ajax.php?action=eventon_ics_download endpoint) — kept separate
// from parseHotClubeDiscovery() above (unchanged, still exactly what
// BOTM-HOT-CLUBE-EVENT-URL-01 proved) rather than folding into it, so
// existing callers/tests are unaffected.
const ICS_LINK_RE = /class='evo_ics_nCal'|class="evo_ics_nCal"/;

/**
 * Parse one Hot Clube homepage HTML document into
 * `{ event_id, ics_url }` records — one per distinct event_id, reading
 * each event's own rendered "Calendário" anchor href verbatim (HTML-
 * entity-unescaped: `&amp;` -> `&`) rather than reconstructing the
 * `sunix`/`eunix`/`loca`/`locn` query parameters by hand. `ics_url` is
 * null for an event whose container has no such link (never guessed).
 */
export function parseHotClubeIcsLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Hot Clube homepage HTML");
  }

  // A wider window than parseHotClubeDiscovery()'s default: the
  // "Calendário" ICS link (and the Add-to-Google-Calendar link right
  // after it) render considerably further into the card than the
  // Schema.org microdata block that default window was sized for —
  // directly confirmed against the live page (~6.4KB into the card).
  const records = [];
  for (const { eventId, window } of eventWindows(html, 12000)) {
    if (records.some((r) => r.event_id === eventId)) continue;

    let icsUrl = null;
    if (ICS_LINK_RE.test(window)) {
      const hrefMatch = /href=['"]([^'"]+action=eventon_ics_download[^'"]*)['"]/.exec(window);
      icsUrl = hrefMatch ? hrefMatch[1].replace(/&amp;/g, "&") : null;
    }

    records.push({ event_id: eventId, ics_url: icsUrl });
  }

  return records;
}
