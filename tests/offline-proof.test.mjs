import assert from "node:assert/strict";
import test from "node:test";
import { canonicalUrlFromHtml, proveCanonicalDetailEvents } from "../ingestion/programme-acquisition/offline-proof.mjs";
import { extractJsonLdEventLinks } from "../ingestion/programme-acquisition/discovery.mjs";

test("proves a retained detail Event only when its canonical link agrees with the document URL", () => {
  const body = '<link rel="canonical" href="/events/good"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Good","startDate":"2026-09-01T20:00:00+01:00","url":"/events/good","@id":"/events/good"}</script>';
  const proofs = proveCanonicalDetailEvents([{ url: "https://venue.example/events/good", body }], { cutoffDate: "2026-08-29" });
  assert.deepEqual(proofs, [{
    title: "Good", start_raw: "2026-09-01T20:00:00+01:00", source_record_id: "https://venue.example/events/good", event_url: "https://venue.example/events/good",
    source_document_url: "https://venue.example/events/good", source_document_canonical_url: "https://venue.example/events/good",
    json_ld_event_url: "https://venue.example/events/good", json_ld_id: "https://venue.example/events/good",
    source_record_id_basis: "SOURCE_PUBLISHED_CANONICAL_EVENT_URL", proof_kind: "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT",
  }]);
});

test("rejects a category page that merely links to an Event URL", () => {
  const body = '<link rel="canonical" href="/events/category/music"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Not a detail proof","startDate":"2026-09-01","url":"/events/good"}</script>';
  assert.deepEqual(proveCanonicalDetailEvents([{ url: "https://venue.example/events/category/music", body }]), []);
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — a real
// Manchester run found two genuine detail pages (The Deaf Institute,
// Gorilla) whose own canonical link correctly self-identifies the page,
// but whose Event JSON-LD `url` disagrees because it points to a
// third-party ticketing platform (fatsoma.com) instead of back to
// itself — a common, real-world pattern, not a listing page in
// disguise. The proof must still succeed via the canonical basis.
test("a genuine detail page (canonical self-matches) still proves even when the Event's own url points to a third-party ticketing platform on a different origin", () => {
  const body = '<link rel="canonical" href="https://www.thedeafinstitute.co.uk/event/split-chain/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Split Chain","startDate":"2026-09-20T18:00","url":"https://www.fatsoma.com/e/taey4e4r/split-chain"}</script>';
  const proofs = proveCanonicalDetailEvents([{ url: "https://www.thedeafinstitute.co.uk/event/split-chain/", body }], { cutoffDate: "2026-01-01" });
  assert.equal(proofs.length, 1);
  assert.equal(proofs[0].source_record_id, "https://www.thedeafinstitute.co.uk/event/split-chain/");
  assert.equal(proofs[0].source_record_id_basis, "SOURCE_PUBLISHED_CANONICAL_EVENT_URL");
  assert.equal(proofs[0].json_ld_event_url, "https://www.fatsoma.com/e/taey4e4r/split-chain", "the disagreeing off-origin JSON-LD url is retained as evidence, not silently discarded");
});

test("a same-origin Event url mismatch on a canonical-self-matching page is STILL rejected — this narrows the check only for a different origin, never for a sibling page on the same site", () => {
  const body = '<link rel="canonical" href="/events/this-one"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Wrong Page","startDate":"2026-09-01","url":"/events/a-different-one"}</script>';
  assert.deepEqual(proveCanonicalDetailEvents([{ url: "https://venue.example/events/this-one", body }]), []);
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real
// Manchester venue (The Bridgewater Hall) publishes real, genuine,
// self-canonical detail pages with a real <h1> title and real
// human-readable date text, but ZERO structured markup at all. Proof
// now succeeds via independent title+date TEXT corroboration against
// the listing's own claimed record — never from the listing alone.
const bridgewaterDetailBody = '<link rel="canonical" href="https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/"><h1 class="c-event-item__heading">30th Anniversary Concert</h1><p class="c-event-item__datetime">Sunday 20 September 2026</p>';
const bridgewaterListingRecord = { event_url: "https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/", title: "30th Anniversary Concert", start_raw: "2026-09-20" };

test("a genuine detail page with NO JSON-LD/microdata at all still proves via independent title+date text corroboration against the listing's own record", () => {
  const proofs = proveCanonicalDetailEvents(
    [{ url: "https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/", body: bridgewaterDetailBody }],
    { cutoffDate: "2026-01-01", listingRecords: [bridgewaterListingRecord] },
  );
  assert.equal(proofs.length, 1);
  assert.equal(proofs[0].source_record_id, "https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/");
  assert.equal(proofs[0].source_record_id_basis, "CANONICAL_DETAIL_TEXT_CORROBORATION");
});

test("text corroboration NEVER fires when no matching listing record was supplied (e.g. no listingRecords passed at all) — it is never a single-source guess", () => {
  const proofs = proveCanonicalDetailEvents([{ url: "https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/", body: bridgewaterDetailBody }], { cutoffDate: "2026-01-01" });
  assert.deepEqual(proofs, []);
});

test("text corroboration is rejected when the detail page's OWN title text disagrees with what the listing independently claimed", () => {
  const proofs = proveCanonicalDetailEvents(
    [{ url: "https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/", body: bridgewaterDetailBody }],
    { cutoffDate: "2026-01-01", listingRecords: [{ ...bridgewaterListingRecord, title: "A Completely Different Event" }] },
  );
  assert.deepEqual(proofs, []);
});

test("text corroboration is rejected when the detail page's OWN date text disagrees with what the listing independently claimed", () => {
  const proofs = proveCanonicalDetailEvents(
    [{ url: "https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/", body: bridgewaterDetailBody }],
    { cutoffDate: "2026-01-01", listingRecords: [{ ...bridgewaterListingRecord, start_raw: "2026-09-21" }] },
  );
  assert.deepEqual(proofs, []);
});

test("text corroboration NEVER displaces real JSON-LD evidence when both are present on the same document", () => {
  const body = '<link rel="canonical" href="https://venue.example/e/a"><h1>Wrong Title Text</h1><script type="application/ld+json">{"@type":"Event","name":"Real JSON-LD Title","startDate":"2026-09-01","url":"https://venue.example/e/a"}</script>';
  const proofs = proveCanonicalDetailEvents(
    [{ url: "https://venue.example/e/a", body }],
    { cutoffDate: "2026-01-01", listingRecords: [{ event_url: "https://venue.example/e/a", title: "Wrong Title Text", start_raw: "2026-09-01" }] },
  );
  assert.equal(proofs.length, 1);
  assert.equal(proofs[0].title, "Real JSON-LD Title", "the real JSON-LD basis must win, never the text-corroboration fallback, when both are available");
  assert.equal(proofs[0].source_record_id_basis, "SOURCE_PUBLISHED_CANONICAL_EVENT_URL");
});

test("text corroboration is rejected when the listing record itself points at a DIFFERENT canonical URL (no accidental pairing)", () => {
  const proofs = proveCanonicalDetailEvents(
    [{ url: "https://www.bridgewater-hall.co.uk/whats-on/30th-anniversary-concert-200926/", body: bridgewaterDetailBody }],
    { cutoffDate: "2026-01-01", listingRecords: [{ ...bridgewaterListingRecord, event_url: "https://www.bridgewater-hall.co.uk/whats-on/a-totally-different-event/" }] },
  );
  assert.deepEqual(proofs, []);
});

test("canonical link extraction resolves a relative href and strips a fragment", () => {
  assert.equal(canonicalUrlFromHtml('<link href="/event#fragment" rel="canonical">', "https://venue.example/a"), "https://venue.example/event");
});

test("discovers same-origin JSON-LD Event URLs from a listing page without accepting an off-origin URL", () => {
  const html = '<script type="application/ld+json">[{"@context":"https://schema.org","@type":"Event","name":"First","url":"/events/first"},{"@context":"https://schema.org","@type":"Event","name":"Elsewhere","url":"https://elsewhere.example/events/no"}]</script>';
  assert.deepEqual(extractJsonLdEventLinks(html, { baseUrl: "https://venue.example/whats-on" }), [{ url: "https://venue.example/events/first", text: "First", role: "JSON_LD_EVENT_DETAIL_CANDIDATE" }]);
});
