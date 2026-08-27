import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EVENTS_ENDPOINT, buildEventsQueryUrl, parseEventsResponse } from "../ingestion/coliseu-porto/client.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/coliseu-porto/${name}`, import.meta.url), "utf8");
}

// 1. URL construction

test("buildEventsQueryUrl builds a GET request against the discovered public endpoint", () => {
  const url = buildEventsQueryUrl({ limit: 5, offset: 0 });
  assert.ok(url.startsWith(EVENTS_ENDPOINT));
  assert.equal(EVENTS_ENDPOINT, "https://nest.coliseu.pt/graph/");
});

test("buildEventsQueryUrl encodes the exact proven paging/sorting/filter query shape", () => {
  const url = buildEventsQueryUrl({ limit: 5, offset: 10 });
  const parsed = new URL(url);
  const query = parsed.searchParams.get("query");
  assert.ok(query, "expected a query search param");
  assert.ok(query.includes("events(paging:{limit:5,offset:10}"));
  assert.ok(query.includes("sorting:[{field:startDate,direction:ASC}]"));
  assert.ok(query.includes("filter:{isVisible:{is:true},isArchived:{is:false}}"));
  assert.ok(query.includes("totalCount"));
  assert.ok(query.includes("nodes{id name slug startDate estimatedDuration ticketsSeller ticketsUrl minimumAge category{name} room{name} promoter{name}}"));
});

test("buildEventsQueryUrl defaults offset to 0 when omitted", () => {
  const url = new URL(buildEventsQueryUrl({ limit: 5 }));
  assert.ok(url.searchParams.get("query").includes("offset:0}"));
});

test("buildEventsQueryUrl requires a positive integer limit, never guesses", () => {
  assert.throws(() => buildEventsQueryUrl({}), /positive integer limit/);
  assert.throws(() => buildEventsQueryUrl({ limit: 0 }), /positive integer limit/);
  assert.throws(() => buildEventsQueryUrl({ limit: -3 }), /positive integer limit/);
  assert.throws(() => buildEventsQueryUrl({ limit: 5.5 }), /positive integer limit/);
  assert.throws(() => buildEventsQueryUrl({ limit: "5" }), /positive integer limit/);
});

test("buildEventsQueryUrl requires a non-negative integer offset", () => {
  assert.throws(() => buildEventsQueryUrl({ limit: 5, offset: -1 }), /non-negative integer offset/);
  assert.throws(() => buildEventsQueryUrl({ limit: 5, offset: 1.5 }), /non-negative integer offset/);
});

// 2. response parsing against the retained fixtures

test("parseEventsResponse parses the real retained events-page-1 fixture", async () => {
  const body = await loadFixture("events-page-1.json");
  const { totalCount, nodes } = parseEventsResponse(body);
  assert.equal(totalCount, 72);
  assert.equal(nodes.length, 5);
  assert.equal(nodes[0].id, "1951");
  assert.equal(nodes[0].name, "He´s Back | Michael Jackson Tribute");
  assert.equal(nodes[0].startDate, "2026-09-12T20:00:00.000Z");
});

test("parseEventsResponse parses the synthetic events-page-2 fixture (self-contained scenario)", async () => {
  const body = await loadFixture("events-page-2-synthetic.json");
  const { totalCount, nodes } = parseEventsResponse(body);
  assert.equal(totalCount, 2);
  assert.equal(nodes.length, 2);
  assert.deepEqual(
    nodes.map((n) => n.id),
    ["9001", "9002"],
  );
});

test("parseEventsResponse throws on malformed (non-JSON) input, never guesses", () => {
  assert.throws(() => parseEventsResponse("{not valid json"), /not valid JSON/);
});

test("parseEventsResponse throws on a non-empty-string requirement", () => {
  assert.throws(() => parseEventsResponse(""), /non-empty response body string/);
  assert.throws(() => parseEventsResponse(null), /non-empty response body string/);
});

test("parseEventsResponse throws when the JSON body has no data.events.{totalCount,nodes} shape", () => {
  assert.throws(() => parseEventsResponse('{"data":{}}'), /well-formed "data.events/);
  assert.throws(() => parseEventsResponse('{"foo":"bar"}'), /well-formed "data.events/);
  assert.throws(() => parseEventsResponse('{"data":{"events":{"totalCount":5}}}'), /well-formed "data.events/);
  assert.throws(() => parseEventsResponse('{"data":{"events":{"nodes":[]}}}'), /well-formed "data.events/);
  assert.throws(() => parseEventsResponse("[]"), /did not parse to a JSON object/);
});

test("parseEventsResponse throws when the server reports a GraphQL errors array", () => {
  assert.throws(
    () => parseEventsResponse('{"errors":[{"message":"Syntax Error: Unexpected Name"}]}'),
    /reported errors: Syntax Error/,
  );
});

test("parseEventsResponse never throws on a genuinely empty last page", () => {
  const { totalCount, nodes } = parseEventsResponse('{"data":{"events":{"totalCount":72,"nodes":[]}}}');
  assert.equal(totalCount, 72);
  assert.deepEqual(nodes, []);
});

// 3. deterministic rerun

test("parsing the same retained fixture twice is deterministic", async () => {
  const body = await loadFixture("events-page-1.json");
  assert.deepEqual(parseEventsResponse(body), parseEventsResponse(body));
});
