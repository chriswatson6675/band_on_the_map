import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyMusicRecord,
  parseJsonPayload,
  selectRepresentativeSample,
  summariseRecords,
} from "../ingestion/agendalx/contract.mjs";

test("parseJsonPayload rejects non-JSON content types", () => {
  assert.throws(
    () => parseJsonPayload("[]", "text/html; charset=utf-8"),
    /Expected JSON content type/,
  );
});

test("classifyMusicRecord matches deterministic subject and tag values", () => {
  assert.equal(classifyMusicRecord({ subject: "música" }).isMusic, true);
  assert.equal(
    classifyMusicRecord({ tags_name_list: ["gratuito", "concerto"] }).isMusic,
    true,
  );
  assert.equal(
    classifyMusicRecord({
      categories_name_list: {
        musica: { id: 1, slug: "musica", name: "música" },
      },
    }).isMusic,
    true,
  );
  assert.equal(classifyMusicRecord({ subject: "exposições" }).isMusic, false);
});

test("sample fixture remains bounded and parseable without live internet", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/agendalx/sample.json", import.meta.url), "utf8"),
  );

  assert.equal(Array.isArray(fixture.records), true);
  assert.ok(fixture.records.length > 0);
  assert.ok(fixture.records.length <= 10);

  const summary = summariseRecords(fixture.records);
  assert.equal(summary.totalRecords, fixture.records.length);

  const sample = selectRepresentativeSample(fixture.records, 5);
  assert.ok(sample.length <= 5);
});

test("music fixture contains bounded first-party category results with taxonomy evidence", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("../fixtures/agendalx/music-sample.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(
    fixture.metadata.retrieval_strategy,
    "FRONTEND_EVIDENCED_CATEGORY_QUERY",
  );
  assert.equal(fixture.metadata.reported_music_event_count, 77);
  assert.equal(Array.isArray(fixture.records), true);
  assert.equal(fixture.records.length, 10);
  assert.equal(fixture.classification_evidence.length, fixture.records.length);

  for (const [index, record] of fixture.records.entries()) {
    const evidence = fixture.classification_evidence[index];

    assert.equal(evidence.id, record.id);
    assert.equal(evidence.page, 1);
    assert.ok(evidence.evidence.length > 0);
    assert.ok(
      evidence.evidence.some((item) =>
        ["musica", "música", "música, visitas guiadas"].includes(item.value),
      ),
    );
    assert.equal(classifyMusicRecord(record).isMusic, true);
  }
});
