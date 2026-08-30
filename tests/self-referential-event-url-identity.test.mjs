// BEATMAPPED-JSON-LD-SELF-REFERENTIAL-EVENT-URL-IDENTITY-01
//
// The Berlin IP-1 cohort (tempodrom-berlin, waldbuehne-berlin) reaches
// STABLE_IDENTITY_PROOF_FAILED for one reason only: their detail pages publish
// no <link rel="canonical">, so proveCanonicalDetailEvents() skipped every
// document before examining a single Event node. Those same documents each
// carry one JSON-LD Event that publishes its own ABSOLUTE url identifying that
// very document — measured 11/11 on each source, distinct, collision-free and
// byte-identical across two independent live acquisitions.
//
// These tests pin the narrow additive basis that accepts exactly that, and —
// far more importantly — pin everything it must still refuse. They are
// mechanism-generic: no hostname, city or source id is special-cased.

import assert from "node:assert/strict";
import test from "node:test";

import { canonicalLinkDeclared, proveCanonicalDetailEvents } from "../ingestion/programme-acquisition/offline-proof.mjs";

const ORIGIN = "https://arbitrary-venue.example";
const CUTOFF = "2026-08-29";

const eventJson = (fields) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Event", ...fields })}</script>`;

/** A detail document publishing NO canonical, with one self-referential Event. */
function selfReferentialDetail(path = "/events/a", overrides = {}) {
  const url = `${ORIGIN}${path}`;
  return {
    url,
    body: eventJson({ name: "Self Referential", startDate: "2026-09-01T20:00:00+01:00", url, ...overrides }),
  };
}

const proofsFor = (documents) => proveCanonicalDetailEvents(documents, { cutoffDate: CUTOFF });

// --- §5: absence of a canonical, and only absence, opens the new basis ---

test("canonicalLinkDeclared distinguishes an ABSENT canonical from a declared-but-unreadable one", () => {
  assert.equal(canonicalLinkDeclared("<html><head></head></html>"), false);
  assert.equal(canonicalLinkDeclared('<link rel="stylesheet" href="/a.css">'), false);
  // Declared, in either attribute order, however broken the href is.
  assert.equal(canonicalLinkDeclared('<link rel="canonical">'), true);
  assert.equal(canonicalLinkDeclared('<link rel="canonical" href="">'), true);
  assert.equal(canonicalLinkDeclared('<link href="" rel="canonical">'), true);
});

// --- §12/§13: the IP-1 shape now proves, under a DISTINCT basis ---

test("an Event publishing its own absolute self-referential url proves when no canonical is declared", () => {
  const proofs = proofsFor([selfReferentialDetail()]);
  assert.deepEqual(proofs, [{
    title: "Self Referential",
    start_raw: "2026-09-01T20:00:00+01:00",
    source_record_id: `${ORIGIN}/events/a`,
    event_url: `${ORIGIN}/events/a`,
    source_document_url: `${ORIGIN}/events/a`,
    source_document_canonical_url: null,
    json_ld_event_url: `${ORIGIN}/events/a`,
    json_ld_id: null,
    source_record_id_basis: "SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL",
    proof_kind: "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT",
  }]);
});

test("the new basis never masquerades as canonical proof", () => {
  const [selfReferential] = proofsFor([selfReferentialDetail()]);
  assert.notEqual(selfReferential.source_record_id_basis, "SOURCE_PUBLISHED_CANONICAL_EVENT_URL");
  // And the honest tell that no canonical existed is retained alongside it.
  assert.equal(selfReferential.source_document_canonical_url, null);
});

test("§21 evidence is retained: proof kind, document URL, node URL and identity basis all survive", () => {
  const [proof] = proofsFor([selfReferentialDetail()]);
  assert.equal(proof.proof_kind, "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT");
  assert.equal(proof.source_document_url, `${ORIGIN}/events/a`);
  assert.equal(proof.json_ld_event_url, `${ORIGIN}/events/a`);
  assert.equal(proof.source_record_id, proof.json_ld_event_url, "identity IS the source-published node URL");
});

// --- §4 / §19: an explicit canonical is never bypassed ---

test("§19 canonical-mismatch: canonical A, fetched B, node.url B is REJECTED", () => {
  const url = `${ORIGIN}/events/b`;
  assert.deepEqual(proofsFor([{
    url,
    body: `<link rel="canonical" href="${ORIGIN}/events/a">` + eventJson({ name: "Contradicted", startDate: "2026-09-01T20:00:00+01:00", url }),
  }]), [], "a self-referential node URL must not override a contradictory published canonical");
});

test("a declared but unreadable canonical is an invalid canonical, not an absent one", () => {
  const url = `${ORIGIN}/events/c`;
  for (const declared of ['<link rel="canonical" href="">', '<link rel="canonical">', '<link href="" rel="canonical">']) {
    assert.deepEqual(
      proofsFor([{ url, body: declared + eventJson({ name: "Declared canonical", startDate: "2026-09-01T20:00:00+01:00", url }) }]),
      [],
      `a declared canonical (${declared}) must not fall through to the self-referential basis`,
    );
  }
});

test("a canonical that agrees still proves under the canonical basis, not the new one", () => {
  const url = `${ORIGIN}/events/d`;
  const [proof] = proofsFor([{
    url,
    body: `<link rel="canonical" href="${url}">` + eventJson({ name: "Canonical wins", startDate: "2026-09-01T20:00:00+01:00", url }),
  }]);
  assert.equal(proof.source_record_id_basis, "SOURCE_PUBLISHED_CANONICAL_EVENT_URL");
  assert.equal(proof.source_document_canonical_url, url);
});

// --- §20: self-referentiality is mandatory ---

test("§20 node-url-mismatch: no canonical, node.url A, fetched B is REJECTED", () => {
  assert.deepEqual(proofsFor([{
    url: `${ORIGIN}/events/b`,
    body: eventJson({ name: "Points elsewhere", startDate: "2026-09-01T20:00:00+01:00", url: `${ORIGIN}/events/a` }),
  }]), []);
});

test("a listing document without a canonical cannot be promoted — its nodes point outward", () => {
  const url = `${ORIGIN}/programme`;
  assert.deepEqual(proofsFor([{
    url,
    body:
      eventJson({ name: "Listed One", startDate: "2026-09-01T20:00:00+01:00", url: `${ORIGIN}/events/one` }) +
      eventJson({ name: "Listed Two", startDate: "2026-09-02T20:00:00+01:00", url: `${ORIGIN}/events/two` }),
  }]), [], "outbound listing nodes must never mint identity for the listing page or for the events they link to");
});

// --- §9: the print/query-variant negative control ---

test("§9 a fetched URL with no canonical and no self-referential node mints NO identity", () => {
  // The real shape this guards against: tempodrom's first fetched detail
  // candidate is a print variant of a listing page. It publishes no canonical,
  // so a "fall back to the fetched URL" rule would have minted an identity for
  // it. Here it carries no Event node at all.
  assert.deepEqual(proofsFor([{ url: `${ORIGIN}/programme-und-tickets/?printpdf=1`, body: "<html><body>Print view</body></html>" }]), []);
});

test("§9 a print variant carrying the SAME event must not mint a second identity for the print URL", () => {
  const clean = `${ORIGIN}/events/a`;
  const print = `${ORIGIN}/events/a?printpdf=1`;
  const event = { name: "Same Event", startDate: "2026-09-01T20:00:00+01:00", url: clean };
  const proofs = proofsFor([
    { url: clean, body: eventJson(event) },
    // The print variant publishes the SAME node, whose url names the clean
    // page — so it is not self-referential and is rejected outright.
    { url: print, body: eventJson(event) },
  ]);
  assert.equal(proofs.length, 1, "the print variant must not become a second identity");
  assert.equal(proofs[0].source_record_id, clean);
  assert.equal(proofs[0].source_document_url, clean, "the surviving proof must come from the clean document, not the print variant");
});

test("§9 a query string is never stripped to manufacture self-referentiality", () => {
  assert.deepEqual(proofsFor([{
    url: `${ORIGIN}/events/a?printpdf=1`,
    body: eventJson({ name: "Query variant", startDate: "2026-09-01T20:00:00+01:00", url: `${ORIGIN}/events/a` }),
  }]), [], "node.url and the fetched URL differ by a query string and must NOT be equated");
});

// --- §7 / §11: the source must publish the absolute identity itself ---

test("§7 a relative node.url is never absolutised into an identity", () => {
  for (const relative of ["/events/a", "events/a", "./a", "event_94072_0"]) {
    assert.deepEqual(
      proofsFor([{ url: `${ORIGIN}/events/a`, body: eventJson({ name: "Relative", startDate: "2026-09-01T20:00:00+01:00", url: relative }) }]),
      [],
      `a relative url (${relative}) must not be resolved against the document URL to mint identity`,
    );
  }
});

test("§11 @id is never promoted to identity — not absolute, relative, or matching", () => {
  const url = `${ORIGIN}/events/a`;
  // A relative @id (a-trane's real shape) alongside no usable node url.
  assert.deepEqual(
    proofsFor([{ url, body: eventJson({ name: "Id only", startDate: "2026-09-01T20:00:00+01:00", "@id": "event_94072_0" }) }]),
    [],
    "an @id must never stand in for a missing node url",
  );
  // Even an absolute, self-referential @id is not an identity source.
  assert.deepEqual(
    proofsFor([{ url, body: eventJson({ name: "Absolute id only", startDate: "2026-09-01T20:00:00+01:00", "@id": url }) }]),
    [],
  );
});

test("§11 an absolute @id is retained as evidence but is never the identity", () => {
  const url = `${ORIGIN}/events/a`;
  const [proof] = proofsFor([{ url, body: eventJson({ name: "Both", startDate: "2026-09-01T20:00:00+01:00", url, "@id": `${ORIGIN}/id/99` }) }]);
  assert.equal(proof.source_record_id, url, "identity comes from url, never @id");
  assert.equal(proof.json_ld_id, `${ORIGIN}/id/99`, "the published @id is retained verbatim as evidence");
});

test("§11 a relative @id is never resolved against the document URL, even on an accepted proof", () => {
  const url = `${ORIGIN}/events/a`;
  const [proof] = proofsFor([{ url, body: eventJson({ name: "Rel id", startDate: "2026-09-01T20:00:00+01:00", url, "@id": "event_94072_0" }) }]);
  assert.equal(proof.source_record_id, url);
  assert.equal(proof.json_ld_id, null, "a relative @id must be recorded as absent, never resolved to a fabricated absolute URL");
});

// --- §18: malformed, hostile and colliding URLs ---

test("§18 a non-http(s) or malformed node.url is rejected", () => {
  const url = `${ORIGIN}/events/a`;
  for (const hostile of ["javascript:alert(1)", "data:text/html,<b>x", "ftp://arbitrary-venue.example/events/a", "http://[not-a-url", "//arbitrary-venue.example/events/a", ""]) {
    assert.deepEqual(
      proofsFor([{ url, body: eventJson({ name: "Hostile", startDate: "2026-09-01T20:00:00+01:00", url: hostile }) }]),
      [],
      `node.url ${JSON.stringify(hostile)} must never mint identity`,
    );
  }
});

test("§18 a missing node.url is rejected — the fetched URL is never substituted", () => {
  assert.deepEqual(proofsFor([{
    url: `${ORIGIN}/events/a`,
    body: eventJson({ name: "No url", startDate: "2026-09-01T20:00:00+01:00" }),
  }]), []);
});

test("§18 a non-string node.url object form is not accepted as a source-published absolute identity", () => {
  const url = `${ORIGIN}/events/a`;
  assert.deepEqual(proofsFor([{
    url,
    body: eventJson({ name: "Object url", startDate: "2026-09-01T20:00:00+01:00", url: { "@type": "URL", url } }),
  }]), []);
});

test("§18 two distinct Events both claiming to BE the document is ambiguous and proves NOTHING", () => {
  const url = `${ORIGIN}/events/a`;
  assert.deepEqual(proofsFor([{
    url,
    body:
      eventJson({ name: "First Event", startDate: "2026-09-01T20:00:00+01:00", url }) +
      eventJson({ name: "Second Event", startDate: "2026-09-02T20:00:00+01:00", url }),
  }]), [], "one identity cannot stand for two events — the document must be rejected whole, not silently deduped to the last node");
});

test("§18 the existing dedupe policy is not weakened: two documents yielding one identity collapse as before", () => {
  const url = `${ORIGIN}/events/a`;
  const proofs = proofsFor([
    { url, body: eventJson({ name: "Once", startDate: "2026-09-01T20:00:00+01:00", url }) },
    { url, body: eventJson({ name: "Once", startDate: "2026-09-01T20:00:00+01:00", url }) },
  ]);
  assert.equal(proofs.length, 1);
});

// --- §6: every existing event-acceptance rule still applies ---

test("§6 the new basis relaxes no existing event requirement", () => {
  const url = `${ORIGIN}/events/a`;
  const cases = {
    "missing name": { startDate: "2026-09-01T20:00:00+01:00", url },
    "empty name": { name: "   ", startDate: "2026-09-01T20:00:00+01:00", url },
    "missing startDate": { name: "No date", url },
    "before cutoff": { name: "Past", startDate: "2026-08-01T20:00:00+01:00", url },
    // BEATMAPPED-PROOF-DATE-PREFIX-PARSING-01 replaced this case. It used to
    // be `startDate: "2026-8-31T20:30+2:00"` ("unparseable"), which encoded the
    // very defect that package fixed: an unpadded month/day is a perfectly
    // readable source-published date and now proves. The property under test
    // here is unchanged — the identity basis relaxes no date rule — so the
    // case is now an impossible calendar date, which is still rejected.
    "impossible calendar date": { name: "Never happened", startDate: "2026-2-30T20:30+2:00", url },
    "malformed date prefix": { name: "Garbage", startDate: "2026-8-31garbage", url },
  };
  for (const [label, fields] of Object.entries(cases)) {
    assert.deepEqual(proofsFor([{ url, body: eventJson(fields) }]), [], `${label} must still be rejected`);
  }
});

test("§6 a non-Event node is never promoted, however self-referential its url", () => {
  const url = `${ORIGIN}/events/a`;
  for (const type of ["WebPage", "Article", "Organization", "BreadcrumbList"]) {
    const body = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": type, name: "Not an event", startDate: "2026-09-01T20:00:00+01:00", url })}</script>`;
    assert.deepEqual(proofsFor([{ url, body }]), [], `a ${type} node must never become event identity`);
  }
});

test("a MusicEvent is accepted on the same terms as an Event", () => {
  const url = `${ORIGIN}/events/a`;
  const body = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "MusicEvent", name: "Gig", startDate: "2026-09-01T20:00:00+01:00", url })}</script>`;
  const [proof] = proofsFor([{ url, body }]);
  assert.equal(proof.source_record_id_basis, "SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL");
});

// --- §14/§17: the shapes that must stay unprovable ---

test("§17 a canonical-free document with no Event node proves nothing (the IP-2 shape)", () => {
  assert.deepEqual(proofsFor([{ url: `${ORIGIN}/events/a`, body: "<html><body><h1>Concert</h1><p>1 September</p></body></html>" }]), []);
});

test("§14 an Event node publishing NO url still proves via canonical — the new basis cannot displace it", () => {
  // b-flat's real shape: canonical present, Event node carries no url at all.
  const url = `${ORIGIN}/events/a`;
  const [proof] = proofsFor([{
    url,
    body: `<link rel="canonical" href="${url}">` + eventJson({ name: "No node url", startDate: "2026-09-01T20:00:00+01:00" }),
  }]);
  assert.equal(proof.source_record_id, url);
  assert.equal(proof.source_record_id_basis, "SOURCE_PUBLISHED_CANONICAL_EVENT_URL");
});
