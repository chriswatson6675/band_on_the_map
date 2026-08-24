import assert from "node:assert/strict";
import test from "node:test";
import { parseHotClubeIcsLinks } from "../ingestion/hot-clube/discovery.mjs";

// A small, deliberately synthetic homepage HTML fixture — structurally
// faithful to the real EventON markup (see docs/sources/HOT_CLUBE.md and
// tests/hot-clube-discovery.test.mjs's own synthetic fixture), with
// fabricated event data. The "Calendário" link is placed several
// thousand characters after the container's own opening tag, matching
// the real page's layout (confirmed against a live fetch during
// LISBON-AUTOMATIC-SUBSET-01) — proving parseHotClubeIcsLinks's wider
// window genuinely reaches it.
function syntheticHomepage({ padding = 7000 } = {}) {
  const filler = `<p>filler content within the same card</p>`.repeat(Math.ceil(padding / 42));
  return `
<div class="eventon_events_list">
  <div id="event_1001" class="eventon_list_event evo_eventtop event" data-event_id="1001" data-time="1700000000-1700003600">
    ${filler}
    <a href='https://hcp.pt/cms/admin-ajax.php?action=eventon_ics_download&amp;event_id=1001&amp;sunix=20260901T190000Z&amp;eunix=20260901T220000Z&amp;loca=Example%20Street&amp;locn=Example%20Venue' class='evo_ics_nCal' title='Adicionar ao calendário'>Calendário</a>
  </div>
  <div id="event_1002" class="eventon_list_event evo_eventtop event" data-event_id="1002" data-time="1700100000-1700103600">
    <p>no calendar link on this one</p>
  </div>
</div>
`;
}

test("finds the real 'Calendário' ICS link, unescaped, even far into a large card", () => {
  const links = parseHotClubeIcsLinks(syntheticHomepage());
  const withLink = links.find((l) => l.event_id === "1001");
  assert.equal(
    withLink.ics_url,
    "https://hcp.pt/cms/admin-ajax.php?action=eventon_ics_download&event_id=1001&sunix=20260901T190000Z&eunix=20260901T220000Z&loca=Example%20Street&locn=Example%20Venue",
  );
  assert.ok(!withLink.ics_url.includes("&amp;"), "must be HTML-entity-unescaped");
});

test("an event card with no Calendário link gets ics_url: null, never guessed", () => {
  const links = parseHotClubeIcsLinks(syntheticHomepage());
  const withoutLink = links.find((l) => l.event_id === "1002");
  assert.equal(withoutLink.ics_url, null);
});

test("rejects empty input", () => {
  assert.throws(() => parseHotClubeIcsLinks(""), /non-empty/);
});

test("deduplicates by event_id like parseHotClubeDiscovery does", () => {
  const html = syntheticHomepage() + syntheticHomepage(); // simulate the card rendered twice
  const links = parseHotClubeIcsLinks(html);
  assert.equal(links.filter((l) => l.event_id === "1001").length, 1);
});
