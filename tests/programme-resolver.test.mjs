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
  // BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-AND-DISCOVERY-CORRECTION-01: the
  // resolver now ALSO always attempts robots.txt/sitemap.xml discovery
  // (bounded, 2 requests) plus the fixed common-path candidates, even when
  // homepage nav has no matching link — see resolveProgrammeSource's own
  // header comment. A fetchDocument spy that throws for every URL must
  // still resolve to UNRESOLVED (every candidate legitimately fails to
  // fetch, none crosses the threshold), never PROVEN and never a thrown
  // exception escaping the resolver itself.
  const calls = [];
  const fetchDocument = async (url) => { calls.push(url); throw new Error("simulated unreachable"); };
  const result = await resolveProgrammeSource({ homepage: { url: "https://arbitrary.example/", body: '<a href="/about">About</a>' }, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_UNRESOLVED");
  assert.ok(calls.includes("https://arbitrary.example/robots.txt"), "robots.txt discovery must still be attempted, bounded, even with no nav match");
  assert.ok(calls.some((u) => u.includes("/events")), "the fixed common-path candidates must still be attempted");
});

test("resolver never follows a link the homepage places off the page's own origin", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="https://offsite.example/events">Events (offsite)</a>' };
  const calls = [];
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => { calls.push(url); return { url, status: 200, body: "" }; } });
  assert.ok(!calls.includes("https://offsite.example/events"), "same-origin restriction on homepage nav links must be unchanged");
  assert.equal(result.state, "PROGRAMME_SOURCE_UNRESOLVED");
});

test("common deterministic paths are tried even when the homepage has zero matching nav links", async () => {
  const homepage = { url: "https://arbitrary.example/", body: "<p>No navigation at all.</p>" };
  const result = await resolveProgrammeSource({
    homepage,
    fetchDocument: async (url) => {
      if (url === "https://arbitrary.example/whats-on") {
        return { url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' };
      }
      return { url, status: 404, body: "" };
    },
  });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on");
  assert.equal(result.selected.discovery, "COMMON_DETERMINISTIC_PATH");
});

test("sitemap.xml entries are examined and can resolve the programme source", async () => {
  const homepage = { url: "https://arbitrary.example/", body: "<p>No navigation at all.</p>" };
  const sitemapXml = "<urlset><url><loc>https://arbitrary.example/gigs-listing</loc></url></urlset>";
  const result = await resolveProgrammeSource({
    homepage,
    fetchDocument: async (url) => {
      if (url === "https://arbitrary.example/sitemap.xml") return { url, status: 200, body: sitemapXml };
      if (url === "https://arbitrary.example/gigs-listing") return { url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' };
      return { url, status: 404, body: "" };
    },
  });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/gigs-listing");
  assert.equal(result.selected.discovery, "SITEMAP_XML");
});

test("robots.txt Sitemap: reference is followed when present", async () => {
  const homepage = { url: "https://arbitrary.example/", body: "<p>No navigation at all.</p>" };
  const robotsTxt = "User-agent: *\nDisallow:\nSitemap: https://arbitrary.example/custom-sitemap.xml\n";
  const sitemapXml = "<urlset><url><loc>https://arbitrary.example/whats-on</loc></url></urlset>";
  const result = await resolveProgrammeSource({
    homepage,
    fetchDocument: async (url) => {
      if (url === "https://arbitrary.example/robots.txt") return { url, status: 200, body: robotsTxt };
      if (url === "https://arbitrary.example/sitemap.xml") return { url, status: 404, body: "" };
      if (url === "https://arbitrary.example/custom-sitemap.xml") return { url, status: 200, body: sitemapXml };
      if (url === "https://arbitrary.example/whats-on") return { url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' };
      return { url, status: 404, body: "" };
    },
  });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
});

test("a sitemap INDEX (sitemapindex, listing sub-sitemaps) is followed one bounded level — the sub-sitemap's own XML is never scored as if it were a programme HTML page", async () => {
  const homepage = { url: "https://arbitrary.example/", body: "<p>No navigation at all.</p>" };
  const sitemapIndex = "<sitemapindex><sitemap><loc>https://arbitrary.example/sitemap-posttype-event.xml</loc></sitemap><sitemap><loc>https://arbitrary.example/sitemap-posttype-post.xml</loc></sitemap></sitemapindex>";
  const eventSitemap = "<urlset><url><loc>https://arbitrary.example/events/some-gig-2026-09-01/</loc></url></urlset>";
  const calls = [];
  const result = await resolveProgrammeSource({
    homepage,
    fetchDocument: async (url) => {
      calls.push(url);
      if (url === "https://arbitrary.example/sitemap.xml") return { url, status: 200, body: sitemapIndex };
      if (url === "https://arbitrary.example/sitemap-posttype-event.xml") return { url, status: 200, body: eventSitemap };
      if (url === "https://arbitrary.example/events/some-gig-2026-09-01/") return { url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/events/some-gig-2026-09-01/"}</script>' };
      return { url, status: 404, body: "" };
    },
  });
  assert.ok(!calls.includes("https://arbitrary.example/sitemap-posttype-post.xml"), "must only follow the programme-like-named sub-sitemap, not every sub-sitemap a real index might list");
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/events/some-gig-2026-09-01/", "must select a real page from the sub-sitemap's own <loc> entries, never the sub-sitemap's raw XML itself");
});

test("PHASE 7 (Manchester Correction-02): a real listing/index page with multiple distinct events is preferred over an individual event's own detail page, when both are candidates", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<nav><a href="/events/some-gig-2026">Some Gig 2026</a><a href="/events">Events</a></nav>' };
  const singleEventPage = (url) => ({
    url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html",
    body: '<script type="application/ld+json">{"@type":"Event","name":"Some Gig","startDate":"2099-09-01T20:00:00Z"}</script>',
  });
  const listingPage = (url) => ({
    url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html",
    body: Array.from({ length: 8 }, (_, i) => `<script type="application/ld+json">{"@type":"Event","name":"Gig ${i}","startDate":"2099-09-0${(i % 9) + 1}T20:00:00Z"}</script>`).join(""),
  });
  const result = await resolveProgrammeSource({
    homepage,
    fetchDocument: async (url) => (url.endsWith("/events") ? listingPage(url) : singleEventPage(url)),
  });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/events", "the multi-event listing must win over the single event's own detail page");
  assert.equal(result.selected.event_entity_count, 8);
});

test("PHASE 7: a single event's own detail page can still resolve when it is the ONLY candidate available (never penalised in isolation)", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<nav><a href="/events/some-gig-2026">Some Gig 2026</a></nav>' };
  const singleEventPage = (url) => ({
    url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html",
    body: '<script type="application/ld+json">{"@type":"Event","name":"Some Gig","startDate":"2099-09-01T20:00:00Z"}</script>',
  });
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => (url.startsWith("https://arbitrary.example/events/") ? singleEventPage(url) : { url, status: 404, body: "" }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.event_entity_count, 1);
});

test("resolveProgrammeSource stays within a bounded, fixed request budget (no unbounded/recursive crawl)", async () => {
  const homepage = {
    url: "https://arbitrary.example/",
    body: Array.from({ length: 50 }, (_, i) => `<a href="/events-${i}">Events ${i}</a>`).join(""),
  };
  const calls = [];
  await resolveProgrammeSource({ homepage, fetchDocument: async (url) => { calls.push(url); return { url, status: 200, body: "<p>no events here</p>" }; } });
  assert.ok(calls.length <= 25, `expected a small, fixed request budget, got ${calls.length} calls`);
});
