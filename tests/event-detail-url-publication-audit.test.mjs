import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPublicationAudit } from "../research/event-detail-url-preservation-01/build-publication-audit.mjs";

test("committed read-only publication audit is reproducible and accounts for the broader defect", async () => {
  const generated = await buildPublicationAudit();
  const committed = JSON.parse(await readFile(new URL("../research/event-detail-url-preservation-01/publication-audit.json", import.meta.url), "utf8"));
  assert.deepEqual(committed, generated);
  assert.equal(generated.totals.determinable_published_events, 423);
  assert.equal(generated.totals.affected_null_event_url, 209);
  assert.equal(generated.totals.affected_source_count, 4);
  assert.equal(generated.totals.reconstructable_from_published_source_record_id, 171);
  assert.equal(generated.totals.not_reconstructable_from_publication_alone, 38);
  assert.equal(generated.sources["zig-zag-jazz-club-berlin"].null_event_url_count, 29);
});
