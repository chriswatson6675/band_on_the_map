// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01
//
// Bounded, sequential, live re-check of 8 ADDITIONAL Level-2-CONFIRMED
// estate candidates that were never part of the previous 17-venue
// tranche, chosen here because they are self-evidently, primarily live
// -music venues by their own name/description (606 Club: jazz; FOLD:
// electronic club; Notting Hill Arts Club: live music/DJ; Heaven:
// LGBTQ+ music/club; The Waiting Room: small live-music pub venue;
// Venue 229 / Metroland Studios / zodiac: bar/venue spaces) -- worth a
// bounded technical check against current main's collectors before
// declaring the tranche thin, per task section 7's "prefer strong
// obvious music venues" and section 5's remaining-time guidance.
//
// Every raw response retained as fixture evidence; no invented data.

import { writeFile, mkdir } from "node:fs/promises";
import { fetchText } from "../../../../ingestion/http/fetch.mjs";
import { extractEventNodes, filterMusicEventNodes } from "../../../../ingestion/json-ld/parse.mjs";

const CANDIDATES = [
  { id: "606-club-london", url: "https://www.606club.co.uk/events/" },
  { id: "fold-london", url: "https://www.fold.london/tickets" },
  { id: "notting-hill-arts-club-london", url: "https://nottinghillartsclub.com/events-list/" },
  { id: "heaven-london", url: "https://g-a-yandheaven.co.uk/event/all-hours/" },
  { id: "the-waiting-room-london", url: "https://www.thewaitingroomn16.com/" },
  { id: "venue-229-london", url: "https://229.london/whatson/" },
  { id: "metroland-studios-london", url: "https://metrolandcultures.com/#events" },
  { id: "zodiac-london", url: "https://www.zodiacbarlondon.com/events" },
];

const FIXTURE_DIR = "fixtures/london-main-rebase-01";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const results = [];
  for (const c of CANDIDATES) {
    let entry = { id: c.id, url: c.url };
    try {
      const res = await fetchText(c.url, { timeoutMs: 20000 });
      const fixturePath = `${FIXTURE_DIR}/${c.id}.html`;
      await writeFile(fixturePath, res.text ?? "");
      entry.http_status = res.status;
      entry.ok = res.ok;
      entry.fixture = fixturePath;
      entry.bytes = (res.text ?? "").length;
      const nodes = extractEventNodes(res.text ?? "");
      const { musicNodes, rejectedNodes } = filterMusicEventNodes(nodes);
      entry.raw_event_nodes = nodes.length;
      entry.music_relevant = musicNodes.length;
      entry.non_music = rejectedNodes.length;
      entry.has_squarespace_eventlist = /<article class="eventlist-event/.test(res.text ?? "");
      entry.has_squarespace_summary_item = /summary-item-record-type-event/.test(res.text ?? "");
      entry.titles_sample = musicNodes.slice(0, 5).map((n) => n?.name ?? null);
    } catch (err) {
      entry.error = String(err?.message ?? err);
    }
    results.push(entry);
    console.log(JSON.stringify(entry));
    await sleep(1200);
  }
  const outPath = "research/source-investigations/beatmapped-london-first-tranche-main-rebase-and-music-gate-01/evidence/live-verify-additional-music-candidates-output.json";
  await writeFile(outPath, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2) + "\n");
  console.log("WROTE", outPath);
}

main().catch((err) => { console.error(err); process.exit(1); });
