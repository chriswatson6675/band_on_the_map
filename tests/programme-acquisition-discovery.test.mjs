import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { extractProgrammeLinks, proveJsonLdEvents } from "../ingestion/programme-acquisition/discovery.mjs";

test("generic programme link discovery is same-origin, deduplicated, and selector-free", () => {
  const html = `<a href="/events/a">First concert</a><a href="/events/a#x">duplicate</a><a href="https://tickets.example/b">Tickets</a><a href="/privacy">Events privacy</a>`;
  assert.deepEqual(extractProgrammeLinks(html, { baseUrl: "https://venue.example/programme" }), [
    { url: "https://venue.example/events/a", text: "First concert", role: "EVENT_DETAIL_CANDIDATE" },
  ]);
});

test("generic list/detail JSON-LD proof normalizes real events through the existing observation path", async () => {
  const [so36List, so36Detail, bflatList, bflatDetail] = await Promise.all([
    readFile(new URL("../fixtures/so36-berlin/tickets-listing.html", import.meta.url), "utf8"),
    readFile(new URL("../fixtures/so36-berlin/product-detail.html", import.meta.url), "utf8"),
    readFile(new URL("../fixtures/b-flat-berlin/programm.html", import.meta.url), "utf8"),
    readFile(new URL("../fixtures/b-flat-berlin/event-detail.html", import.meta.url), "utf8"),
  ]);
  assert.ok(extractProgrammeLinks(so36List, { baseUrl: "https://www.so36.com/tickets" }).length >= 1);
  assert.ok(extractProgrammeLinks(bflatList, { baseUrl: "https://b-flat-berlin.de/programm" }).length >= 1);
  const proof = proveJsonLdEvents([
    { url: "https://www.so36.com/produkte/example", body: so36Detail },
    { url: "https://b-flat-berlin.de/events/example", body: bflatDetail },
  ], {
    sourceId: "generic-proof",
    venueName: "Fixture venue",
    retrievedAt: "2026-08-27T00:00:00.000Z",
    cutoffDate: "2026-08-26",
  });
  assert.equal(proof.observations.length, 2);
  assert.ok(proof.observations.every((observation) => observation.title && observation.start.date && observation.event_url));
});
