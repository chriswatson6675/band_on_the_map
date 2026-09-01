// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01
//
// Live, sequential (never parallel-hammering one host), bounded
// re-verification of the previous 17-venue tranche's own source URLs,
// run against CURRENT MAIN's real collector modules
// (ingestion/json-ld/parse.mjs's extractEventNodes+filterMusicEventNodes,
// ingestion/static-cards/collector.mjs's collectStaticCardEvents) --
// never a re-implementation, never a synthetic result. Every raw
// response body is retained as fixture evidence; every classification
// decision is printed and retained in this evidence file's own JSON
// output, never left only in a scratchpad or terminal transcript.
//
// This directly implements the MUSIC GATE (task section 4): classifies
// every acquired record as MUSIC_RELEVANT or NON_MUSIC using this
// project's OWN existing, already-tested keyword/type mechanism (never a
// newly-invented genre classifier).

import { writeFile, mkdir } from "node:fs/promises";
import { fetchText } from "../../../../ingestion/http/fetch.mjs";
import { extractEventNodes, filterMusicEventNodes } from "../../../../ingestion/json-ld/parse.mjs";
import { collectStaticCardEvents } from "../../../../ingestion/static-cards/collector.mjs";

const CUTOFF = "2026-09-01";

// -- JSON-LD family candidates (previous tranche's 10 "MINOR_ADAPTER"/
// "CONFIGURATION_ONLY" sources) --
const JSON_LD_CANDIDATES = [
  { id: "sohoplace-london", venueName: "@sohoplace", url: "https://sohoplace.org/whats-on/" },
  { id: "top-secret-comedy-club-23-kingsway-london", venueName: "Top Secret Comedy Club (23 Kingsway)", url: "https://thetopsecretcomedyclub.co.uk/events-listings/" },
  { id: "downstairs-at-the-dome-london", venueName: "Downstairs at The Dome", url: "https://www.domelondon.co.uk/whatson" },
  { id: "e1-london", venueName: "E1", url: "https://www.e1ldn.co/events" },
  { id: "emergency-exit-arts-london", venueName: "Emergency Exit Arts", url: "https://eea.org.uk/events" },
  { id: "bow-arts-trust-bow-road-studios-london", venueName: "Bow Arts Trust (Bow Road Studios)", url: "https://bowarts.org/bow-arts-events/" },
  { id: "night-tales-loft-london", venueName: "Night Tales Loft", url: "https://www.ntloft.co.uk/events" },
  { id: "chats-palace-london", venueName: "Chats Palace", url: "https://chatspalace.com/new-events/" },
  { id: "the-roxy-london", venueName: "The Roxy", url: "https://www.theroxy.co.uk/whatson" },
  // Fire: prior tranche used a third-party Skiddle listing. Task section 6
  // requires a first-party source. Testing the venue's OWN site here.
  { id: "fire-london", venueName: "Fire", url: "https://www.firelondon.net/events/" },
];

// -- Static-card family candidates (previous tranche's 7 "SMALL_BESPOKE"
// venues, re-tested here against the GENERIC static-cards collector that
// now exists on current main, per task section 8: prefer an
// already-existing generic module over a stale bespoke copy) --
const STATIC_CARD_CANDIDATES = [
  { id: "100-club-london", venueName: "100 Club", url: "https://www.the100club.co.uk/100club-events/" },
  { id: "the-underworld-london", venueName: "The Underworld", url: "https://www.theunderworldcamden.co.uk/search-events/" },
  { id: "fusebox-london", venueName: "FUSEBOX", url: "https://creativeyouthcharity.org/whats-on/" },
  { id: "jazz-cafe-posk-london", venueName: "Jazz Cafe Posk", url: "https://jazzcafeposk.org/gig-guide/" },
  { id: "brockley-jack-theatre-london", venueName: "Brockley Jack Theatre", url: "https://brockleyjack.co.uk/whats-on/" },
  { id: "bridge-house-theatre-london", venueName: "Bridge House Theatre", url: "https://thebridgehousetheatre.co.uk/current-shows/" },
  { id: "arts-catalyst-centre-for-arts-science-and-technology-london", venueName: "Arts Catalyst Centre for Arts, Science, and Technology", url: "https://artscatalyst.org/whats-on?on-now&order=DESC" },
];

const FIXTURE_DIR = "fixtures/london-main-rebase-01";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const results = [];

  for (const c of JSON_LD_CANDIDATES) {
    let entry = { id: c.id, url: c.url, family: "json-ld", venueName: c.venueName };
    try {
      const res = await fetchText(c.url, { timeoutMs: 20000 });
      const fixturePath = `${FIXTURE_DIR}/${c.id}.html`;
      await writeFile(fixturePath, res.text ?? "");
      entry.http_status = res.status;
      entry.ok = res.ok;
      entry.fixture = fixturePath;
      const nodes = extractEventNodes(res.text ?? "");
      const { musicNodes, rejectedNodes } = filterMusicEventNodes(nodes);
      entry.raw_event_nodes = nodes.length;
      entry.music_relevant = musicNodes.length;
      entry.non_music = rejectedNodes.length;
      entry.rejected_titles_sample = rejectedNodes.slice(0, 5).map((n) => n?.name ?? null);
      entry.music_titles_sample = musicNodes.slice(0, 5).map((n) => n?.name ?? null);
      entry.types_sample = nodes.slice(0, 3).map((n) => n?.["@type"] ?? null);
    } catch (err) {
      entry.error = String(err?.message ?? err);
    }
    results.push(entry);
    console.log(JSON.stringify(entry));
    await sleep(1200);
  }

  for (const c of STATIC_CARD_CANDIDATES) {
    let entry = { id: c.id, url: c.url, family: "static-cards", venueName: c.venueName };
    try {
      const res = await fetchText(c.url, { timeoutMs: 20000 });
      const fixturePath = `${FIXTURE_DIR}/${c.id}.html`;
      await writeFile(fixturePath, res.text ?? "");
      entry.http_status = res.status;
      entry.ok = res.ok;
      entry.fixture = fixturePath;
      const result = collectStaticCardEvents(
        { url: c.url, body: res.text ?? "", at: res.retrievedAt },
        { sourceId: c.id, venueName: c.venueName, cutoffDate: CUTOFF },
      );
      entry.raw_records = result.records.length;
      entry.routing_provenance = result.routing_provenance;
      entry.titles_sample = result.records.slice(0, 8).map((r) => r.title);
    } catch (err) {
      entry.error = String(err?.message ?? err);
    }
    results.push(entry);
    console.log(JSON.stringify(entry));
    await sleep(1200);
  }

  const outPath = "research/source-investigations/beatmapped-london-first-tranche-main-rebase-and-music-gate-01/evidence/live-verify-tranche-candidates-output.json";
  await writeFile(outPath, JSON.stringify({ generated_at: new Date().toISOString(), cutoff: CUTOFF, results }, null, 2) + "\n");
  console.log("WROTE", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
