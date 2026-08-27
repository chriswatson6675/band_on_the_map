import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseFamaDAlfamaAgenda, VENUE_KEY } from "../ingestion/fama-dalfama/discovery.mjs";

async function loadFixtureHtml() {
  return readFile(new URL("../fixtures/fama-dalfama/agenda-excerpt.html", import.meta.url), "utf8");
}

// 1. fixture acquisition/parsing

test("discovery extracts every real day-block on the retained agenda excerpt", async () => {
  const html = await loadFixtureHtml();
  const records = parseFamaDAlfamaAgenda(html);
  assert.equal(records.length, 11); // 01/08..10/08 plus 31/08, per this bounded fixture
  assert.deepEqual(
    records.map((r) => r.date_iso),
    [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-31",
    ],
  );
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseFamaDAlfamaAgenda(""), /non-empty/);
  assert.throws(() => parseFamaDAlfamaAgenda(null), /non-empty/);
});

test("discovery throws when no page-level month/year heading is present, never guesses", () => {
  assert.throws(
    () => parseFamaDAlfamaAgenda("<html><body>no agenda here</body></html>"),
    /exactly one page-level month\/year heading/,
  );
});

test("discovery throws on more than one month/year heading, never picks one", () => {
  const html = `
    <h2 class="elementor-heading-title elementor-size-default">AGOSTO 2026</h2>
    <h2 class="elementor-heading-title elementor-size-default">SETEMBRO 2026</h2>
    <p class="elementor-heading-title elementor-size-default">01/08</p>
    <h2 class="elementor-heading-title elementor-size-default">Sábado</h2>
    <p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph">Someone</p>
  `;
  assert.throws(() => parseFamaDAlfamaAgenda(html), /exactly one page-level month\/year heading/);
});

test("discovery throws when a page-level heading is present but zero day-blocks are found", () => {
  const html = `<h2 class="elementor-heading-title elementor-size-default">AGOSTO 2026</h2>`;
  assert.throws(() => parseFamaDAlfamaAgenda(html), /zero day-blocks/);
});

// 2. DETERMINISTIC_CONTEXT date derivation, cross-checked against real
// Gregorian calendar math — matching the exact proof already performed in
// research/source-investigations/fama-dalfama-lisbon-01/evidence/offline-proof.mjs

test("date_iso is mechanically derived from the page heading + day-block DD/MM, cross-checked against real Gregorian weekday arithmetic", async () => {
  const html = await loadFixtureHtml();
  const records = parseFamaDAlfamaAgenda(html);

  // 1 August 2026 is a genuine, independently-verifiable Saturday.
  const first = records.find((r) => r.date_iso === "2026-08-01");
  assert.equal(first.weekday_text, "Sábado");
  assert.equal(new Date(Date.UTC(2026, 7, 1)).getUTCDay(), 6); // 6 = Saturday

  // 31 August 2026 is a genuine, independently-verifiable Monday.
  const last = records.find((r) => r.date_iso === "2026-08-31");
  assert.equal(last.weekday_text, "Segunda-feira");
  assert.equal(new Date(Date.UTC(2026, 7, 31)).getUTCDay(), 1); // 1 = Monday
});

test("discovery throws when a day-block's own weekday text contradicts real Gregorian calendar arithmetic", () => {
  const html = `
    <h2 class="elementor-heading-title elementor-size-default">AGOSTO 2026</h2>
    <p class="elementor-heading-title elementor-size-default">01/08</p>
    <h2 class="elementor-heading-title elementor-size-default">Domingo</h2>
    <p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph">Someone</p>
  `; // 1 August 2026 is actually a Saturday, not "Domingo" (Sunday)
  assert.throws(() => parseFamaDAlfamaAgenda(html), /real Gregorian calendar arithmetic says/);
});

test("discovery throws when a day-block's own DD/MM month disagrees with the page heading's month", () => {
  const html = `
    <h2 class="elementor-heading-title elementor-size-default">AGOSTO 2026</h2>
    <p class="elementor-heading-title elementor-size-default">01/09</p>
    <h2 class="elementor-heading-title elementor-size-default">Terça-feira</h2>
    <p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph">Someone</p>
  `;
  assert.throws(() => parseFamaDAlfamaAgenda(html), /disagrees with the page heading's month/);
});

// 3. composite source_record_id (this source's documented alternative
// identity strategy — see discovery.mjs's own doc comment)

test("source_record_id is the documented composite venue-key + derived date, unique per record", async () => {
  const html = await loadFixtureHtml();
  const records = parseFamaDAlfamaAgenda(html);
  for (const r of records) {
    assert.equal(r.source_record_id, `${VENUE_KEY}:${r.date_iso}`);
  }
  const ids = records.map((r) => r.source_record_id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate source_record_id");
});

// 4. title/performers_text derivation

test("title and performers_text are genuinely populated for every day-block, never guessed", async () => {
  const html = await loadFixtureHtml();
  const records = parseFamaDAlfamaAgenda(html);
  for (const r of records) {
    assert.ok(Array.isArray(r.performers_text) && r.performers_text.length > 0);
    assert.equal(r.title, r.performers_text.join(" | "));
  }
  const first = records.find((r) => r.date_iso === "2026-08-01");
  assert.deepEqual(first.performers_text, [
    "Miguel Dias & Matilde Cid",
    "Tomás Pauseiro – Guitarra Portuguesa",
    "Diogo de Castro – Viola de Fado",
  ]);
});

// 5. shared page-level time text (not per day-block)

test("time_text/opens_time_text are the same shared page-level constant on every record", async () => {
  const html = await loadFixtureHtml();
  const records = parseFamaDAlfamaAgenda(html);
  for (const r of records) {
    assert.equal(r.time_text, "20h30");
    assert.equal(r.opens_time_text, "19h00");
  }
});

test("time_text is honestly null when the retained page carries no shared time text at all", () => {
  const html = `
    <h2 class="elementor-heading-title elementor-size-default">AGOSTO 2026</h2>
    <p class="elementor-heading-title elementor-size-default">01/08</p>
    <h2 class="elementor-heading-title elementor-size-default">Sábado</h2>
    <p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph">Someone</p>
  `;
  const [record] = parseFamaDAlfamaAgenda(html);
  assert.equal(record.time_text, null);
  assert.equal(record.opens_time_text, null);
});

// 6. raw_day_block_text retained verbatim for provenance

test("raw_day_block_text retains the day-block's own matched HTML verbatim", async () => {
  const html = await loadFixtureHtml();
  const records = parseFamaDAlfamaAgenda(html);
  const first = records.find((r) => r.date_iso === "2026-08-01");
  assert.ok(first.raw_day_block_text.includes("01/08"));
  assert.ok(first.raw_day_block_text.includes("Sábado"));
  assert.ok(first.raw_day_block_text.includes("Miguel Dias"));
});

// 7. duplicate-date defence

test("discovery throws on two day-blocks that would collide on the same derived date", () => {
  const html = `
    <h2 class="elementor-heading-title elementor-size-default">AGOSTO 2026</h2>
    <p class="elementor-heading-title elementor-size-default">01/08</p>
    <h2 class="elementor-heading-title elementor-size-default">Sábado</h2>
    <p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph">First</p>
    <p class="elementor-heading-title elementor-size-default">01/08</p>
    <h2 class="elementor-heading-title elementor-size-default">Sábado</h2>
    <p data-prosemirror-content-type="node" data-prosemirror-node-name="paragraph">Second</p>
  `;
  assert.throws(() => parseFamaDAlfamaAgenda(html), /Duplicate day-block/);
});

// 8. deterministic rerun

test("parsing is deterministic against the same retained fixture", async () => {
  const html = await loadFixtureHtml();
  assert.deepEqual(parseFamaDAlfamaAgenda(html), parseFamaDAlfamaAgenda(html));
});
