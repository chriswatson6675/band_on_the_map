// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Point Éphémère (200 Quai de
// Valmy, 75010 Paris), a single-venue Prismic repository ("pointf") — see
// research/source-investigations/point-ephemere-paris-01/. Every document
// of this repository's own custom type "event" is one of this venue's own
// programmed nights; this is a single-venue source, resolved by source_id
// (matching ingestion/badehaus/observation-adapter.mjs's and
// ingestion/zenner/observation-adapter.mjs's own precedent), not a
// multi-venue feed needing a per-record venue field.
//
// Uses ingestion/prismic-api/client.mjs (generic) with this repository's
// own custom-type name and field names — the only things this module adds
// on top of the generic family.

import { buildDocumentsSearchUrl, parseSearchResponse } from "../prismic-api/client.mjs";

export const PRISMIC_REPOSITORY = "pointf";
export const EVENT_DOCUMENT_TYPE = "event";

const AGENDA_URL = "https://www.pointephemere.org/agenda";

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Build the `documents/search` URL for every "event" document, optionally
 * bounded to dates on/after `fromDate` ("YYYY-MM-DD"), ordered by the
 * repository's own `start_date` field ascending. `searchFormAction` and
 * `ref` come from the repository's own API root (see
 * ingestion/prismic-api/client.mjs's parseApiRoot()) — never hardcoded
 * here, since a Prismic ref rotates whenever the repository's content is
 * republished.
 */
export function buildPointEphemereEventsUrl(searchFormAction, ref, { fromDate, page, pageSize = 100 } = {}) {
  const predicates = [`at(document.type,"${EVENT_DOCUMENT_TYPE}")`];
  if (fromDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      throw new Error('buildPointEphemereEventsUrl requires fromDate as "YYYY-MM-DD" when supplied');
    }
    predicates.push(`date.after(my.event.start_date,"${fromDate}")`);
  }
  return buildDocumentsSearchUrl(searchFormAction, ref, {
    predicates,
    orderings: "[my.event.start_date]",
    page,
    pageSize,
  });
}

/**
 * Parse an already-fetched `documents/search` response body into small,
 * structured discovery records — pure mapping/renaming only, never
 * fabricating a value the source did not genuinely supply. `time` and
 * `prix` are kept as this source's own free-text strings (e.g. "20h",
 * "22H - 03H", "10€ / 12€") — parsing them further is the
 * observation-adapter's job, not this module's.
 */
export function parsePointEphemereEvents(body) {
  const { documents } = parseSearchResponse(body);
  return documents
    .filter((doc) => doc?.type === EVENT_DOCUMENT_TYPE)
    .map((doc) => {
      const data = doc?.data ?? {};
      return {
        // Prismic's own permanent, immutable per-document content ID —
        // documented by the platform itself to remain stable for the
        // life of the document, distinct from `uid` (an editable slug
        // field that CAN change) — see docs/SOURCE_INVESTIGATION_POLICY.md's
        // "stable identifier rule".
        source_record_id: nonEmptyString(doc?.id),
        uid: nonEmptyString(doc?.uid),
        title: nonEmptyString(data?.name),
        start_date: nonEmptyString(data?.start_date), // this source's own "YYYY-MM-DD"
        end_date: nonEmptyString(data?.end_date),
        display_date_text: nonEmptyString(data?.display_date),
        time_text: nonEmptyString(data?.time),
        price_text: nonEmptyString(data?.prix),
        category: nonEmptyString(data?.category),
        ticket_url: nonEmptyString(data?.ticket_link?.url),
      };
    });
}

export { AGENDA_URL };
