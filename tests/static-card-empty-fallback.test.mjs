// BEATMAPPED-STATIC-CARD-EMPTY-FALLBACK-CORRECTION-01
//
// b1c4176 ("Add generic static card collector") wired the new collector in
// with a nullish-coalescing chain:
//
//   const jsonLd = embedded ?? staticCards ?? proveJsonLdEvents(documents, ...)
//
// collectStaticCardEvents() ALWAYS returns a result object — even when it
// accepted zero records — so for every STATIC_HTML_CARDS-fingerprinted
// surface the pre-existing deterministic detail-document/JSON-LD proof path
// became unreachable. Sources whose events live only on their detail
// documents silently regressed from ACQUISITION_PROVEN to
// SUPPORTED_COLLECTOR_NO_VALID_EVENTS (measured live on b-flat-berlin:
// 59 card candidates inspected, 0 accepted, no JSON-LD Event nodes on the
// programme page at all).
//
// These tests pin the corrected generic semantics. They are mechanism-
// generic: no hostname, city, or source id is special-cased.

import assert from "node:assert/strict";
import test from "node:test";

import { collectAndProve, routeProgrammeSource } from "../ingestion/programme-acquisition/orchestrator.mjs";

const ORIGIN = "https://arbitrary-venue.example";
const AT = "2026-08-30T00:00:00Z";

/**
 * A programme surface that fingerprints as STATIC_HTML_CARDS (it carries
 * event-card class markers) but whose cards are NOT extractable — no
 * card-local detail link plus <time datetime>. Deliberately carries no
 * JSON-LD of its own, so the only provable events live on detail documents.
 */
function unextractableCardProgramme() {
  return {
    url: `${ORIGIN}/programme`,
    at: AT,
    status: 200,
    content_type: "text/html",
    body:
      '<div class="event-card"><span>Nur Text, kein Link</span></div>' +
      '<div class="event-card"><span>Auch kein Datum</span></div>' +
      `<a href="${ORIGIN}/events/a">A</a><a href="${ORIGIN}/events/b">B</a>`,
  };
}

/** A programme surface whose static cards ARE extractable. */
function extractableCardProgramme() {
  return {
    url: `${ORIGIN}/programme`,
    at: AT,
    status: 200,
    content_type: "text/html",
    body:
      '<article class="event-card">' +
      '<a href="/events/a">CARD TITLE A</a><time datetime="2026-09-01T20:00:00+01:00"></time>' +
      "</article>" +
      '<article class="event-card">' +
      '<a href="/events/b">CARD TITLE B</a><time datetime="2026-09-02T20:00:00+01:00"></time>' +
      "</article>",
  };
}

function detailDocument(path, title, startDate) {
  const url = `${ORIGIN}${path}`;
  return {
    url,
    at: AT,
    status: 200,
    content_type: "text/html",
    body:
      `<link rel="canonical" href="${url}">` +
      '<script type="application/ld+json">' +
      `{"@context":"https://schema.org","@type":"Event","name":"${title}",` +
      `"startDate":"${startDate}","url":"${url}"}` +
      "</script>",
  };
}

const DETAILS = [
  detailDocument("/events/a", "DETAIL TITLE A", "2026-09-01T20:00:00+01:00"),
  detailDocument("/events/b", "DETAIL TITLE B", "2026-09-02T20:00:00+01:00"),
];

function run(programme, detail_documents) {
  return collectAndProve({ source_id: "arbitrary-source", venue_name: "Arbitrary Venue", programme, detail_documents });
}

// --- the fixtures must genuinely exercise the STATIC_HTML_CARDS route ---

test("fixture control: both programme surfaces really do route to STATIC_HTML_CARDS", () => {
  for (const programme of [unextractableCardProgramme(), extractableCardProgramme()]) {
    const routing = routeProgrammeSource(programme);
    assert.equal(
      routing.selected?.mechanism,
      "STATIC_HTML_CARDS",
      "if these fixtures stop routing to STATIC_HTML_CARDS the tests below would prove nothing",
    );
  }
});

// --- §11: zero usable cards must fall through to the deterministic proof ---

test("zero usable static cards falls through to the deterministic detail-document proof (fails on b1c4176)", () => {
  const result = run(unextractableCardProgramme(), DETAILS);

  assert.equal(result.selected.mechanism, "STATIC_HTML_CARDS", "routing itself is unchanged by this correction");
  assert.equal(result.state, "ACQUISITION_PROVEN", "on b1c4176 the empty card result short-circuits this to SUPPORTED_COLLECTOR_NO_VALID_EVENTS");
  assert.equal(result.records.length, 2);
  assert.equal(result.observations.length, 2);
  // The records must genuinely come from the detail-document path.
  assert.deepEqual(result.records.map((r) => r.title).sort(), ["DETAIL TITLE A", "DETAIL TITLE B"]);
});

test("the fallback receives the SAME documents and still produces the canonical first-party proof", () => {
  const result = run(unextractableCardProgramme(), DETAILS);
  assert.equal(result.proofs.length, 2, "canonical detail proof must still run over the detail documents");
  for (const proof of result.proofs) {
    assert.equal(proof.proof_kind, "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT");
    assert.equal(proof.source_record_id_basis, "SOURCE_PUBLISHED_CANONICAL_EVENT_URL");
  }
  assert.equal(result.residue, false);
});

// --- §12: all deterministic paths empty stays terminal, never false success ---

test("zero usable static cards AND no provable detail events preserves the existing terminal outcome", () => {
  const result = run(unextractableCardProgramme(), []);
  assert.equal(result.state, "SUPPORTED_COLLECTOR_NO_VALID_EVENTS");
  assert.equal(result.records.length, 0);
  assert.equal(result.observations.length, 0);
  assert.equal(result.residue, true, "a genuine no-event condition must never become a false success");
});

test("records without canonical proof remain STABLE_IDENTITY_PROOF_FAILED — this correction weakens no proof rule", () => {
  // Detail documents whose canonical URL disagrees with the document URL
  // cannot be proven; the records exist but must not be accepted.
  const unprovable = [{
    url: `${ORIGIN}/events/a`,
    at: AT,
    status: 200,
    content_type: "text/html",
    body:
      `<link rel="canonical" href="${ORIGIN}/somewhere-else">` +
      '<script type="application/ld+json">' +
      `{"@context":"https://schema.org","@type":"Event","name":"Unprovable","startDate":"2026-09-01T20:00:00+01:00","url":"${ORIGIN}/events/a"}` +
      "</script>",
  }];
  const result = run(unextractableCardProgramme(), unprovable);
  assert.equal(result.observations.length, 0);
  assert.equal(result.state, "STABLE_IDENTITY_PROOF_FAILED");
  assert.equal(result.residue, true);
});

// --- §13 / §10: a genuine static-card success must still win ---

test("usable static cards remain authoritative — the fallback must not replace a real static-card success", () => {
  const result = run(extractableCardProgramme(), DETAILS);

  assert.equal(result.selected.mechanism, "STATIC_HTML_CARDS");
  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.equal(result.records.length, 2);
  // Card titles, not detail JSON-LD titles — proof the static-card records
  // were used rather than silently substituted by the fallback.
  assert.deepEqual(result.records.map((r) => r.title).sort(), ["CARD TITLE A", "CARD TITLE B"]);
});

// --- §14: provenance must describe what actually produced the records ---

test("provenance identifies the collector that actually produced the records", () => {
  const viaCards = run(extractableCardProgramme(), DETAILS);
  // BEATMAPPED-STATIC-CARD-TEXT-DATE-ACQUISITION-01 added date-source
  // provenance to this object (both counters below are unchanged). Asserted
  // in full, as before — this fixture's cards carry <time datetime>, so all
  // of them must still be attributed to the machine-readable path and none
  // to any text or contextual derivation.
  assert.deepEqual(
    viaCards.collector_provenance,
    {
      card_candidates_inspected: 2,
      card_records_accepted: 2,
      month_year_headings_found: 0,
      numeric_date_order_proven: null,
      numeric_date_order_evidence: [],
      cards_rejected_no_resolvable_date: 0,
      date_sources: { MACHINE_READABLE_DATETIME: 2, COMPLETE_TEXT_DATE: 0, DETERMINISTIC_CONTEXT_YEAR: 0, DETERMINISTIC_CONTEXT_NUMERIC_ORDER: 0 },
    },
    "a real static-card acquisition keeps its own provenance",
  );

  const viaFallback = run(unextractableCardProgramme(), DETAILS);
  assert.equal(
    viaFallback.collector_provenance,
    null,
    "detail-document JSON-LD success must not be labelled a static-card acquisition (b1c4176 reported card counters here)",
  );
});

// --- §7: embedded-state precedence is untouched ---

test("embedded-state precedence is unchanged — this correction only touches the empty static-card case", () => {
  // An embedded-state surface never reaches the static-card branch at all.
  const embeddedProgramme = {
    url: `${ORIGIN}/programme`,
    at: AT,
    status: 200,
    content_type: "text/html",
    body: '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>',
  };
  const routing = routeProgrammeSource(embeddedProgramme);
  if (routing.selected?.mechanism) {
    assert.doesNotMatch(routing.selected.mechanism, /STATIC_HTML_CARDS/);
  }
  // And the orchestrator must still return a structured result for it.
  const result = collectAndProve({ source_id: "arbitrary-source", venue_name: "Arbitrary Venue", programme: embeddedProgramme, detail_documents: [] });
  assert.ok(typeof result.state === "string" && result.state.length > 0);
});
