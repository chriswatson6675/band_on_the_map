// BARCELONA-30-VENUE-POPULATION-02 — Razzmatazz (Poblenou, Barcelona), a
// major independent Barcelona concert venue (5 rooms; 3 — Sala 1/2/3 —
// host booked touring/local concerts under this source's own `live`
// document type; the other 2 host recurring branded club nights under a
// separate `clubEvent` type, deliberately NOT collected here — see
// research/source-investigations/razzmatazz-barcelona-01/ for why: those
// nights carry no named performer, matching this project's existing
// Otto Zutz/Wolf Barcelona exclusion precedent).
//
// Uses ingestion/sanity/client.mjs (generic) with this source's own
// GROQ query, which dereferences `room` server-side via GROQ's `->`
// operator — no second per-record fetch, no client-side reference
// resolution.

import { buildQueryUrl, parseQueryResponse } from "../sanity/client.mjs";

export const RAZZMATAZZ_SANITY_CONFIG = { projectId: "7jg0n68u", dataset: "production" };

const AGENDA_BASE_URL = "https://www.salarazzmatazz.com/en/agenda/";

/**
 * The GROQ query this collector runs: every `live` (booked concert)
 * document with `date >= fromDate`, ascending, dereferencing `room` to
 * its own `title` ("Sala 1"/"Sala 2"/"Sala 3"). `[0...limit]` is a GROQ
 * slice, not a page cursor — this project's existing Fourvenues
 * precedent (ingestion/fourvenues/client.mjs) already establishes
 * "one wide, explicit request beats an unproven pagination cursor" for a
 * platform with no documented `next` pointer; Sanity's own slice syntax
 * gives the same one-request-covers-the-window property directly.
 */
export function buildFutureLiveQuery(fromDate, limit = 400) {
  if (typeof fromDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    throw new Error('buildFutureLiveQuery requires fromDate as "YYYY-MM-DD"');
  }
  return `*[_type=="live" && date >= "${fromDate}"] | order(date asc) [0...${limit}]{ _id, title, subtitle, date, slug, schedules, ticketUrl, "room": room->title, "artistTitles": artists[]->title }`;
}

export function buildRazzmatazzQueryUrl(fromDate, limit) {
  return buildQueryUrl(RAZZMATAZZ_SANITY_CONFIG, buildFutureLiveQuery(fromDate, limit));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Parse one already-fetched Sanity response body into small, structured
 * discovery records. Throws on a malformed envelope (see
 * ingestion/sanity/client.mjs's parseQueryResponse); a genuinely empty
 * `result: []` is a legitimate, non-throwing "nothing scheduled" case.
 */
export function parseRazzmatazzLiveEvents(body) {
  const result = parseQueryResponse(body);
  if (!Array.isArray(result)) {
    throw new Error("Razzmatazz Sanity query did not return a JSON array result");
  }

  return result.map((raw) => {
    const slug = nonEmptyString(raw?.slug?.current);
    // A minority of records leave the document's own `title` empty and
    // rely entirely on their dereferenced `artists[]->title` instead
    // (real, retained evidence — see
    // research/source-investigations/razzmatazz-barcelona-01/evidence/).
    // Falls back to a comma-joined artist-title list ONLY when `title`
    // itself is genuinely absent; never overrides a present title.
    const artistTitles = Array.isArray(raw?.artistTitles)
      ? raw.artistTitles.filter((name) => typeof name === "string" && name.trim() !== "")
      : [];
    const title = nonEmptyString(raw?.title) ?? (artistTitles.length > 0 ? artistTitles.join(", ") : null);
    return {
      source_record_id: nonEmptyString(raw?._id),
      title,
      subtitle: nonEmptyString(raw?.subtitle),
      date_iso: nonEmptyString(raw?.date), // this source's own "YYYY-MM-DD"
      door_time_text: nonEmptyString(raw?.schedules?.doorOpen),
      start_time_text: nonEmptyString(raw?.schedules?.eventStart),
      room: nonEmptyString(raw?.room),
      ticket_url: nonEmptyString(raw?.ticketUrl),
      event_url: slug ? `${AGENDA_BASE_URL}${slug}/` : null,
    };
  });
}
