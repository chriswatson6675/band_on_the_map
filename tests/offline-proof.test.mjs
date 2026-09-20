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

test("canonical link extraction resolves a relative href and strips a fragment", () => {
  assert.equal(canonicalUrlFromHtml('<link href="/event#fragment" rel="canonical">', "https://venue.example/a"), "https://venue.example/event");
});

test("discovers same-origin JSON-LD Event URLs from a listing page without accepting an off-origin URL", () => {
  const html = '<script type="application/ld+json">[{"@context":"https://schema.org","@type":"Event","name":"First","url":"/events/first"},{"@context":"https://schema.org","@type":"Event","name":"Elsewhere","url":"https://elsewhere.example/events/no"}]</script>';
  assert.deepEqual(extractJsonLdEventLinks(html, { baseUrl: "https://venue.example/whats-on" }), [{ url: "https://venue.example/events/first", text: "First", role: "JSON_LD_EVENT_DETAIL_CANDIDATE" }]);
});
