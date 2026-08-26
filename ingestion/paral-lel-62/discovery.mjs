// BARCELONA-30-VENUE-POPULATION-01 — Paral·lel 62 (Barcelona, formerly
// branded BARTS Barcelona), a bespoke, first-party, custom WordPress REST
// route returning a flat JSON array of every upcoming event in one
// request — no pagination, no per-page crawling. Proven live in
// research/source-investigations/paral-lel-62-barcelona-01/.
//
// Deliberately venue-specific (this exact route is not a generalisable
// platform shared by other sources observed so far) — matching this
// project's existing bespoke-source precedent (e.g.
// ingestion/casa-da-musica/discovery.mjs).

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

/**
 * Parse this source's own "DD-MM-YYYY" date string into "YYYY-MM-DD", or
 * null if it doesn't match that exact shape — never guessed.
 */
export function parseParalLel62Date(dateText) {
  const match = DATE_RE.exec(dateText ?? "");
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * Parse the raw JSON array this source's own
 * `/wp-json/v1/calendar-events-futurs` endpoint returns into small,
 * structured discovery records. Throws on a non-array body — never
 * silently returns an empty list for a malformed response. An empty
 * array is a legitimate, different, non-throwing "nothing scheduled"
 * result.
 */
export function parseParalLel62Events(body) {
  let parsed;
  try {
    parsed = typeof body === "string" ? JSON.parse(body) : body;
  } catch (error) {
    throw new Error(`Paral·lel 62 response body is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Paral·lel 62 response body did not parse to a JSON array");
  }

  return parsed.map((raw, index) => {
    const url = nonEmptyString(raw.url);
    // No numeric/opaque id is exposed by this source at all — the event's
    // own permalink URL is its stable, first-party canonical path (the
    // same documented judgement already made for
    // ingestion/cm-gaia-eventos and ingestion/lav for sources with no id
    // field). Falls back to a positional index only in the pathological
    // case of a missing url, so no two records in one response ever
    // collide.
    const sourceRecordId = url ?? `paral-lel-62-index-${index}`;

    return {
      source_record_id: sourceRecordId,
      title: nonEmptyString(raw.title),
      description: nonEmptyString(raw.excerpt),
      event_url: url,
      date_text: nonEmptyString(raw.date),
      date_iso: parseParalLel62Date(raw.date),
      time_text: nonEmptyString(raw.time),
      doors_time_text: nonEmptyString(raw.portes),
      room: nonEmptyString(raw.espai),
      price_text: nonEmptyString(raw.preu),
      ticket_url: nonEmptyString(raw.tickets),
    };
  });
}
