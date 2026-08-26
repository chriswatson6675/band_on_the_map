// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Festsaal
// Kreuzberg's own bespoke field mapping over its own Wagtail (Django CMS)
// public API v2 response shape — see
// research/source-investigations/festsaal-kreuzberg-berlin-01/. Genuinely
// bespoke: no other source in this trial runs Wagtail, and its JSON
// field names (date/doors/start/changed_text/location.title) are this
// platform's own, not a documented reusable convention this project
// already has a family for.
//
// Cross-listing honesty (this task's Phase 4 requirement): this source's
// own API returns at least one real, retained event whose structured
// 'location' field is null and whose free-text 'changed_text' field
// states the event actually happens at a DIFFERENT venue entirely (e.g.
// "Diese Veranstaltung findet in der Freilichtbühne Weissensee statt!").
// This adapter NEVER defaults such a record to Festsaal Kreuzberg: when
// 'location' is absent/null, venue_name is left null and the free text is
// preserved verbatim in location_text — the venue resolver then leaves it
// UNRESOLVED rather than forcing an incorrect Festsaal Kreuzberg pin.
// Only a record whose own structured 'location.title' genuinely states
// "Festsaal" resolves to this canonical venue.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "festsaal-kreuzberg-berlin";

/**
 * Combine this source's own separate 'date' (YYYY-MM-DD) and 'start'
 * (HH:MM:SS) fields into a floating-local datetime — no timezone is
 * stated by either field, so this is honestly FLOATING_LOCAL, never
 * upgraded to a UTC instant.
 */
export function deriveDateTime(dateValue, timeValue) {
  const dt = emptyDateTime();
  if (typeof dateValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    dt.certainty = "UNKNOWN";
    return dt;
  }
  dt.date = dateValue;
  dt.raw = timeValue ? `${dateValue} ${timeValue}` : dateValue;
  dt.certainty = typeof timeValue === "string" && /^\d{2}:\d{2}:\d{2}$/.test(timeValue) ? "FLOATING_LOCAL" : "DATE_ONLY";
  return dt;
}

export function toObservation(record, { retrievedAt, fixturePath } = {}) {
  if (!record?.id) {
    throw new Error("toObservation requires record.id");
  }

  // A genuinely stated relocation note (own field, own free text) is
  // never silently dropped, and never used to guess a new venue_name.
  const relocationNote = typeof record.changed_text === "string" && record.changed_text.trim() !== "" ? record.changed_text.trim() : null;
  const structuredLocationTitle = record.location?.title ?? null;

  const isFestsaal = !relocationNote && structuredLocationTitle && /festsaal/i.test(structuredLocationTitle);

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(record.id), // Wagtail's own permanent page primary key
    retrieved_at: retrievedAt ?? null,

    source_url: record.meta?.html_url ?? null,
    content_type: "application/json",

    title: record.title ?? null,
    description: record.sub_title ?? null,

    start: deriveDateTime(record.changed_date ?? record.date, record.changed_start ?? record.start),
    end: emptyDateTime(), // NOT_PRESENT on this source's own field shape

    venue_name: isFestsaal ? "Festsaal Kreuzberg" : null,
    location_text: relocationNote ?? structuredLocationTitle,

    price_text: record.price ? `${record.price} €` : null,
    event_url: record.meta?.html_url ?? null,

    source_fields: {
      wagtail_page_id: record.id,
      slug: record.meta?.slug ?? null,
      ticket_url: record.ticket ?? null,
      moved: record.moved ?? false,
      relocation_note: relocationNote,
      genre: record.genre?.meta?.detail_url ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "application/json",
      byte_faithful: true,
    },
  });
}

export function toObservations(records, options = {}) {
  return (records ?? []).map((record) => toObservation(record, options));
}
