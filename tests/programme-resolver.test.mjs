import assert from "node:assert/strict";
import test from "node:test";
import { resolveProgrammeSource } from "../ingestion/programme-acquisition/programme-resolver.mjs";

test("bounded resolver selects an event-rich same-origin page over misleading navigation", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/news">News</a><a href="/whats-on">What\'s On</a>' };
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on");
});

test("resolver fails closed when no programme evidence crosses threshold", async () => {
  const result = await resolveProgrammeSource({ homepage: { url: "https://arbitrary.example/", body: '<a href="/about">About</a>' }, fetchDocument: async () => { throw new Error("must not fetch"); } });
  assert.equal(result.state, "PROGRAMME_SOURCE_UNRESOLVED");
});

// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: a real venue's
// nav link used the HTML entity &#039; for the apostrophe in "What's on"
// (very common in real-world markup) — this must be decoded before
// scoring, or the label never matches "what's on" at all.
test("HTML-entity-encoded apostrophe in link text ('What&#039;s on') is still recognised as a programme candidate", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/news">News</a><a href="/whats-on">What&#039;s on</a>' };
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on");
});

// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: a real venue
// homepage commonly links the SAME programme URL twice — a sparse/
// icon-only nav link, then a clearer "See all What's on" call-to-action
// further down the page. The first occurrence's text alone must never
// silently suppress the candidate when a later occurrence of the exact
// same URL carries clearly matching text.
// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: a real listing
// page with genuine upcoming events, written as UK-style visible text
// dates ("Wed 7 Oct") rather than numeric ISO dates, and no JSON-LD/ICS
// on the listing page itself (structured data lives on individual event
// detail pages, common for card-based listings) — this candidate must
// still cross the selection threshold on text-date evidence alone.
test("a page with real UK-style text dates (no ISO dates, no JSON-LD/ICS) still crosses the selection threshold", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/news">News</a><a href="/whats-on">What\'s on</a>' };
  const cardsBody = '<div class="card">Gig A Wed 7 Oct More info</div><div class="card">Gig B Thu 8 Oct More info</div><div class="card">Gig C Fri 9 Oct More info</div>';
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: cardsBody }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on");
});

test("a URL appearing twice — once with unrecognisable text, once with clear programme text — is still found (text is merged, not just the first occurrence kept)", async () => {
  const homepage = {
    url: "https://arbitrary.example/",
    body: '<a href="/whats-on" class="icon-nav"></a><a href="/whats-on">See all What\'s on</a>',
  };
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on");
});
