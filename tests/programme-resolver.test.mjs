import assert from "node:assert/strict";
import test from "node:test";
import { resolveProgrammeSource } from "../ingestion/programme-acquisition/programme-resolver.mjs";

test("bounded resolver selects an event-rich same-origin page over misleading navigation", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/news">News</a><a href="/whats-on">What\'s On</a>' };
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on");
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — a real page
// (RNCM's own /whats-on/events/) fingerprints as STATIC_HTML_CARDS
// (server-rendered event-card markup) but carries no JSON-LD and no
// ISO-date-regex-matching text (its own dates are plain "Sep 20th",
// no year) — before this package, evidenceScore never rewarded that
// fingerprint at all, so a genuine, already-collector-supported page
// could never even be SELECTED as the programme source.
test("a page with only STATIC_HTML_CARDS evidence (no JSON-LD, no regex-matching dates) still clears the selection threshold", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/whats-on/events">What\'s On</a>' };
  const cardBody = '<div class="event-card"><a href="/performance/a">The Only King</a><div class="event-date">Sep 20<span>th</span></div></div>';
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: cardBody }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on/events");
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — a real venue
// (The Warehouse Project) serves its homepage at www.<domain> with no
// redirect, while its own nav links point to the bare <domain> (no
// "www.") — the same real site, an ordinary authoring inconsistency.
test("a homepage's own nav link to its bare (non-www) host is followed when the homepage itself was fetched under www — the same site, not a different origin", async () => {
  const homepage = { url: "https://www.arbitrary-whp.example/", body: '<a href="https://arbitrary-whp.example/events/">Events</a>' };
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/e/a"}</script>' }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary-whp.example/events/");
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real venue
// (Aviva Studios / Factory International) had sitemap.xml surface a
// stale, single-event 2023 archive page whose JSON-LD `startDate` is
// confirmedly in the past ("25 Apr 2023, midnight") — its fixed
// JSON_LD_EVENT bonus alone outscored the venue's own real, current
// listing page (which had no JSON-LD at all). The bonus must be
// withheld for a confirmed past-only event, without ever penalising a
// genuinely future event or one whose date could not be parsed.
test("a JSON-LD page whose ONLY event is confirmedly in the past does not outrank a real current listing candidate", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/whats-on/stale-2023-event/">Stale Event</a><a href="/whats-on/gigs/">Gigs</a>' };
  const fetchDocument = async (url) => {
    if (url.includes("stale-2023-event")) {
      return { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<script type="application/ld+json">{"@type":"Event","name":"Old Show","startDate":"25 Apr 2023, midnight","url":"/whats-on/stale-2023-event/"}</script>' };
    }
    if (url.includes("/whats-on/gigs")) {
      return { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<div class="event-card"><a href="/whats-on/gigs/a">Gig A</a><time datetime="2026-10-01"></time></div><div class="event-card"><a href="/whats-on/gigs/b">Gig B</a><time datetime="2026-10-02"></time></div>' };
    }
    return { url, status: 404, at: "2026-09-20T00:00:00Z", body: "" };
  };
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on/gigs/", "the real current listing must win, not the confirmedly-stale single event");
});

test("a JSON-LD event with a genuinely FUTURE date still receives its full bonus (this correction never penalises real future evidence)", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/event/a">Event A</a>' };
  const fetchDocument = async (url) => (url.endsWith("/event/a")
    ? { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-10-01T20:00:00Z","url":"/event/a"}</script>' }
    : { url, status: 404, at: "2026-09-20T00:00:00Z", body: "" });
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/event/a");
});

test("a JSON-LD event whose date cannot be parsed at all still receives its full bonus (uncertainty is never treated as staleness)", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/event/a">Event A</a>' };
  const fetchDocument = async (url) => (url.endsWith("/event/a")
    ? { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"TBC","url":"/event/a"}</script>' }
    : { url, status: 404, at: "2026-09-20T00:00:00Z", body: "" });
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/event/a");
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real venue
// (Band on the Wall) had EVERY individual event page tie in score,
// while its own real listing (/events/) was not even competitive,
// because the real listing had no JSON-LD/date/static-card signal of
// its own. The venue's own URL naming (an index-shaped path) is a
// further, independent, deterministic signal.
test("an index-shaped URL path (matching the existing common-path vocabulary) is preferred over a same-scoring individual event page", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/events/">Events</a><a href="/events/one-specific-gig-name/">One Specific Gig Name</a>' };
  const fetchDocument = async (url) => (url === "https://arbitrary.example/events/" || url === "https://arbitrary.example/events/one-specific-gig-name/"
    ? { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<div data-event-="a">Some Gig</div>' }
    : { url, status: 404, at: "2026-09-20T00:00:00Z", body: "" });
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/events/", "the index-shaped path must win the tie, not the detail-shaped slug");
});

test("a URL whose final path segment merely CONTAINS an index word as part of a longer compound (a real photo gallery, not a programme) does not receive the index-path bonus", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/photo-gallery/events-gallery/">Photos</a>' };
  const fetchDocument = async (url) => ({ url, status: 200, at: "2026-09-20T00:00:00Z", body: "<p>2020 2021 2022 2023 2024 2025 photo archive</p>" });
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_UNRESOLVED", "a compound path segment ('events-gallery') must not match the index-word vocabulary");
});

test("an index-shaped path with a literally empty/contentless response never resolves on URL shape alone", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/events/">Events</a>' };
  const fetchDocument = async (url) => ({ url, status: 200, at: "2026-09-20T00:00:00Z", body: "" });
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_UNRESOLVED");
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real venue
// (RNCM) links 29 same-scoring nav candidates, with its own real
// listing landing at position 20 among them purely by alphabetical
// chance — exactly AT the maxCandidates cutoff, so it was silently
// excluded from ever being fetched at all, regardless of any later
// content-based scoring. Deciding which candidates enter the bounded
// budget must itself prefer an index-shaped path, not just alphabetise.
test("an index-shaped candidate is never starved out of the bounded candidate budget by many same-scoring detail-shaped links sorting alphabetically ahead of it", async () => {
  const detailLinks = Array.from({ length: 25 }, (_, i) => `<a href="/performance/artist-${String(i).padStart(2, "0")}">Artist ${i}</a>`).join("");
  const homepage = { url: "https://arbitrary.example/", body: `${detailLinks}<a href="/whats-on/events/">Events</a>` };
  const fetchDocument = async (url) => (url === "https://arbitrary.example/whats-on/events/"
    ? { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<div class="event"><a href="/performance/a">A</a><time datetime="2026-10-01"></time></div><div class="event"><a href="/performance/b">B</a><time datetime="2026-10-02"></time></div>' }
    : { url, status: 404, at: "2026-09-20T00:00:00Z", body: "" });
  const result = await resolveProgrammeSource({ homepage, fetchDocument, maxCandidates: 20 });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on/events/", "the real listing must be fetched (and win) even when outnumbered by 25 alphabetically-earlier detail links, all tied in score");
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — a real venue
// (manchestertheatres.com) has a client-rendered /whatson page carrying
// dozens of incidental ISO-date-shaped substrings (embedded
// config/hydration data, not real distinct events) — once this
// package's own candidate-ordering fix correctly stopped starving it
// out of consideration, its uncapped raw date count alone was enough to
// outrank a genuinely working JSON_LD_EVENT individual event page.
test("a client-rendered page's raw date-text COUNT alone, however large, cannot outrank a real JSON_LD_EVENT page — capped like every other bonus", async () => {
  const manyDates = Array.from({ length: 40 }, (_, i) => `2026-10-${String((i % 28) + 1).padStart(2, "0")}`).join(" ");
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/whatson">Whats On</a><a href="/event/a">Real Event</a>' };
  const fetchDocument = async (url) => {
    if (url === "https://arbitrary.example/whatson") {
      return { url, status: 200, at: "2026-09-20T00:00:00Z", body: `<div id="app"></div><script src="/app.js"></script><!-- ${manyDates} -->` };
    }
    if (url === "https://arbitrary.example/event/a") {
      return { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-10-01","url":"/event/a"}</script>' };
    }
    return { url, status: 404, at: "2026-09-20T00:00:00Z", body: "" };
  };
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/event/a", "a real, working JSON_LD_EVENT page must not lose to a client-rendered page's sheer raw date-text volume");
});

test("a CLIENT_RENDERED_UNKNOWN page still resolves (honestly reaching BROWSER_REQUIRED downstream) when it is the only real candidate available, despite its own bonuses being withheld", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/whats-on">Whats On</a>' };
  const fetchDocument = async (url) => (url === "https://arbitrary.example/whats-on"
    ? { url, status: 200, at: "2026-09-20T00:00:00Z", body: '<div id="app"></div><script src="/app.js"></script>' }
    : { url, status: 404, at: "2026-09-20T00:00:00Z", body: "" });
  const result = await resolveProgrammeSource({ homepage, fetchDocument });
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
