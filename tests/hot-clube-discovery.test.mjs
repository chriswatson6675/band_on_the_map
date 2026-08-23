import assert from "node:assert/strict";
import test from "node:test";
import { findDiscoveryRecord, parseHotClubeDiscovery } from "../ingestion/hot-clube/discovery.mjs";

// A small, deliberately synthetic homepage HTML fixture — structurally
// faithful to the real EventON markup this parser targets (see
// docs/sources/HOT_CLUBE.md's "Individual Event Permalinks"), but with
// fabricated event data rather than copied real content, so this test
// carries no marketing/description text from the live site.
const SYNTHETIC_HOMEPAGE_HTML = `
<div class="eventon_events_list">
  <div id="event_1001" class="eventon_list_event evo_eventtop event" data-event_id="1001" data-time="1700000000-1700003600" itemscope itemtype='http://schema.org/Event' 1>
    <div class="evo_event_schema" style="display:none">
      <a itemprop='url'  href='https://hcp.pt/events/example-band-live/'></a>
      <span itemprop='name'  >Example Band Live</span>
      <meta itemprop='startDate' content='2026-9-1' ></meta>
      <meta itemprop='endDate' content='2026-9-1' ></meta>
      <item style="display:none" itemprop="location" itemscope itemtype="http://schema.org/Place">
        <span itemprop="name">Example Venue</span>
        <span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
          <item itemprop="streetAddress">Example Street 1</item>
        </span>
      </item>
    </div>
    <p>rest of rendered card markup...</p>
  </div>
  <div id="event_1002" class="eventon_list_event evo_eventtop past_event event" data-event_id="1002" data-time="1699000000-1699003600" itemscope itemtype='http://schema.org/Event' 1>
    <div class="evo_event_schema" style="display:none">
      <span itemprop='name'  >No Permalink Example</span>
      <meta itemprop='startDate' content='2026-8-15' ></meta>
    </div>
  </div>
  <!-- the page renders the same event a second time elsewhere, as the real site does -->
  <div id="event_1001" class="eventon_list_event evo_eventtop event" data-event_id="1001" data-time="1700000000-1700003600" itemscope itemtype='http://schema.org/Event' 1>
    <div class="evo_event_schema" style="display:none">
      <a itemprop='url'  href='https://hcp.pt/events/example-band-live/'></a>
      <span itemprop='name'  >Example Band Live</span>
    </div>
  </div>
</div>
`;

test("1. discovery parser extracts the EventON event_id from the container", () => {
  const records = parseHotClubeDiscovery(SYNTHETIC_HOMEPAGE_HTML);
  const ids = records.map((r) => r.event_id);
  assert.deepEqual(ids.sort(), ["1001", "1002"]);
});

test("2. discovery parser extracts the event's own permalink verbatim", () => {
  const records = parseHotClubeDiscovery(SYNTHETIC_HOMEPAGE_HTML);
  const record = findDiscoveryRecord(records, "1001");
  assert.equal(record.event_url, "https://hcp.pt/events/example-band-live/");
});

test("3. event_id and permalink come from the same event container/record", () => {
  const records = parseHotClubeDiscovery(SYNTHETIC_HOMEPAGE_HTML);
  const record = findDiscoveryRecord(records, "1001");
  assert.equal(record.event_id, "1001");
  assert.equal(record.title, "Example Band Live");
  assert.equal(record.event_url, "https://hcp.pt/events/example-band-live/");
  // Sanity: the title genuinely came from the same container as the URL,
  // not from a different one — both point at the same fabricated event.
  assert.ok(record.title.toLowerCase().includes("example band"));
});

test("4. no title-slug URL fabrication: event 1002 has no itemprop='url' and gets no invented permalink", () => {
  const records = parseHotClubeDiscovery(SYNTHETIC_HOMEPAGE_HTML);
  const record = findDiscoveryRecord(records, "1002");
  assert.equal(record.title, "No Permalink Example");
  assert.equal(record.event_url, null, "must not slugify the title into a guessed URL");
});

test("5. an unknown event_id is not found, never a guessed record", () => {
  const records = parseHotClubeDiscovery(SYNTHETIC_HOMEPAGE_HTML);
  assert.equal(findDiscoveryRecord(records, "9999"), null);
});

test("the same event rendered twice on the page is deduplicated by event_id", () => {
  const records = parseHotClubeDiscovery(SYNTHETIC_HOMEPAGE_HTML);
  const matches = records.filter((r) => r.event_id === "1001");
  assert.equal(matches.length, 1);
});

test("parseHotClubeDiscovery rejects empty input rather than silently returning nothing", () => {
  assert.throws(() => parseHotClubeDiscovery(""), /non-empty/);
  assert.throws(() => parseHotClubeDiscovery(null), /non-empty/);
});

test("start_raw/end_raw/venue_name/location_address are extracted when present, null when absent", () => {
  const records = parseHotClubeDiscovery(SYNTHETIC_HOMEPAGE_HTML);
  const withLocation = findDiscoveryRecord(records, "1001");
  assert.equal(withLocation.start_raw, "2026-9-1");
  assert.equal(withLocation.end_raw, "2026-9-1");
  assert.equal(withLocation.venue_name, "Example Venue");
  assert.equal(withLocation.location_address, "Example Street 1");

  const withoutLocation = findDiscoveryRecord(records, "1002");
  assert.equal(withoutLocation.venue_name, null);
  assert.equal(withoutLocation.location_address, null);
  assert.equal(withoutLocation.end_raw, null);
});

test("real retained discovery evidence: all 9 fixture event_ids have a verbatim permalink association", async () => {
  const { readFile } = await import("node:fs/promises");
  const discovery = JSON.parse(
    await readFile(
      new URL("../fixtures/hot-clube/discovery/homepage-event-links.json", import.meta.url),
      "utf8",
    ),
  );
  const expectedIds = ["3786", "3788", "3790", "3793", "3794", "3795", "3797", "3799", "3801"];
  assert.deepEqual(
    discovery.records.map((r) => r.event_id).sort(),
    [...expectedIds].sort(),
  );
  for (const record of discovery.records) {
    assert.equal(typeof record.permalink, "string");
    assert.ok(record.permalink.startsWith("https://hcp.pt/events/"));
  }
});

test("real retained evidence: every permalink was verified and found to redirect to the homepage, so none is 'safe'", async () => {
  const { readFile } = await import("node:fs/promises");
  const discovery = JSON.parse(
    await readFile(
      new URL("../fixtures/hot-clube/discovery/homepage-event-links.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(discovery.permalink_verification.requests_made.length, 9);
  for (const request of discovery.permalink_verification.requests_made) {
    assert.equal(request.http_status, 301);
    assert.equal(request.location_header, "https://hcp.pt/#clube");
  }
  assert.deepEqual(discovery.permalink_verification.safe_event_urls, {});
});
