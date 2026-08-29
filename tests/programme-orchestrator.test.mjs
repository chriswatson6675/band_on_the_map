import assert from "node:assert/strict";
import test from "node:test";
import { collectAndProve, discoverDetailCandidates, routeProgrammeSource } from "../ingestion/programme-acquisition/orchestrator.mjs";

const PROGRAMME = { url: "https://arbitrary.example/whats-on", at: "2026-08-29T00:00:00.000Z", status: 200, content_type: "text/html", body: '<a href="/events/one">Event</a><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"One","startDate":"2026-09-01T20:00:00+01:00","url":"/events/one"}</script>' };
const DETAIL = { url: "https://arbitrary.example/events/one", body: '<link rel="canonical" href="/events/one"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"One","startDate":"2026-09-01T20:00:00+01:00","url":"/events/one"}</script>' };

test("arbitrary JSON-LD source fingerprints, routes, collects, and proves automatically", () => {
  const result = collectAndProve({ source_id: "arbitrary", venue_name: "Arbitrary", programme: PROGRAMME, detail_documents: [DETAIL] });
  assert.equal(result.selected.mechanism, "JSON_LD_EVENT");
  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.equal(result.observations.length, 1);
});

test("generic list/detail discovery includes source-declared JSON-LD detail URLs", () => {
  assert.deepEqual(discoverDetailCandidates(PROGRAMME).map((link) => link.url), ["https://arbitrary.example/events/one"]);
});

test("unsupported client-rendered source goes to residue rather than guessing", () => {
  const result = routeProgrammeSource({ url: "https://arbitrary.example", status: 200, body: '<div id="root"></div><script src="app.js"></script>' });
  assert.equal(result.residue_state, "BROWSER_REQUIRED");
});

test("structured records without detail proof fail closed", () => {
  const result = collectAndProve({ source_id: "arbitrary", venue_name: "Arbitrary", programme: PROGRAMME });
  assert.equal(result.state, "STABLE_IDENTITY_PROOF_FAILED");
});
