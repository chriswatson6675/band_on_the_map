import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchAuditoriEvents, fetchAuditoriText, filterAuditoriMusicEvents, normaliseAuditoriRecord, AUDITORI_OWN_HALLS } from "../ingestion/auditori-barcelona/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/auditori-barcelona/observation-adapter.mjs";

const EVIDENCE_DIR = "../research/source-investigations/l-auditori-barcelona-01/evidence";

async function loadFixture(name) {
  return readFile(new URL(`${EVIDENCE_DIR}/${name}`, import.meta.url), "utf8");
}
async function loadFixtureJson(name) {
  return JSON.parse(await loadFixture(name));
}

test("the source-scoped TLS intermediate is the retained Sectigo CA, not a disabled-verification workaround", async () => {
  const pem = await readFile(new URL("../ingestion/auditori-barcelona/sectigo-public-server-authentication-ca-ov-r36.crt", import.meta.url), "utf8");
  const certificate = new X509Certificate(pem);
  assert.equal(certificate.ca, true);
  assert.match(certificate.subject, /CN=Sectigo Public Server Authentication CA OV R36/);
  assert.match(certificate.issuer, /CN=Sectigo Public Server Authentication Root R46/);
  assert.equal(certificate.fingerprint, "32:1C:A0:56:E4:E4:8D:57:F1:79:A3:BD:DE:CB:C5:21:3B:99:16:C0");
});

test("the source-scoped TLS root is the retained self-signed Sectigo R46 root", async () => {
  const pem = await readFile(new URL("../ingestion/auditori-barcelona/sectigo-public-server-authentication-root-r46.crt", import.meta.url), "utf8");
  const certificate = new X509Certificate(pem);
  assert.equal(certificate.ca, true);
  assert.match(certificate.subject, /CN=Sectigo Public Server Authentication Root R46/);
  assert.equal(certificate.subject, certificate.issuer);
  assert.equal(certificate.fingerprint, "AD:98:F9:F3:E4:7D:75:3B:65:D4:82:B3:A4:52:17:BB:6E:F5:E4:38");
});

test("fetchAuditoriText preserves a bounded timeout and fails closed on transport errors", async () => {
  await assert.rejects(
    () => fetchAuditoriText("https://127.0.0.1:1/", { timeoutMs: 100 }),
    /ECONNREFUSED|timed out/,
  );
});

test("fetchAuditoriEvents follows the site's own real from_date cursor pagination, deduplicated, offline (mocked fetchImpl over 2 real retained batches)", async () => {
  const batch1 = await loadFixtureJson("batch-1.json");
  const batch2 = await loadFixtureJson("batch-2.json");
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    const isFirstCall = !url.includes("from_date=");
    return {
      url,
      status: 200,
      ok: true,
      text: JSON.stringify(isFirstCall ? batch1 : batch2),
      retrievedAt: "2026-08-26T00:00:00.000Z",
    };
  };
  const { records } = await fetchAuditoriEvents({ fetchImpl });
  assert.equal(calls, 3); // batch1 (30, full) -> batch2 (30, full, same mock forever) -> stalls once from_date repeats
  assert.ok(records.length >= 30);
});

test("fetchAuditoriEvents stops on a short (final) batch without further requests", async () => {
  const batch1 = await loadFixtureJson("batch-1.json");
  const shortBatch = batch1.slice(0, 5);
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    return { url, status: 200, ok: true, text: JSON.stringify(shortBatch), retrievedAt: "2026-08-26T00:00:00.000Z" };
  };
  const { records } = await fetchAuditoriEvents({ fetchImpl });
  assert.equal(calls, 1);
  assert.equal(records.length, 5);
});

test("fetchAuditoriEvents throws on a non-2xx HTTP response", async () => {
  const fetchImpl = async (url) => ({ url, status: 500, ok: false, text: "", retrievedAt: "2026-08-26T00:00:00.000Z" });
  await assert.rejects(() => fetchAuditoriEvents({ fetchImpl }), /HTTP 500/);
});

test("filterAuditoriMusicEvents keeps real Symphonic/Chamber/Jazz&Pop/New Music/Early Music records and rejects Social/Educational/museum-exhibition records (real retained sample)", async () => {
  const records = await loadFixtureJson("auditori-events-merged-sample.json");
  const { musicRecords, rejectedRecords } = filterAuditoriMusicEvents(records);
  assert.ok(musicRecords.length > 100);
  assert.ok(rejectedRecords.length > 0);
  assert.ok(musicRecords.every((r) => !["Social", "Educational"].includes(r.tax_ecategory_str)));
  // A real museum-exhibition record (no music category) must be rejected
  assert.ok(rejectedRecords.some((r) => (r.tax_cicles_str ?? "").includes("Museu de la Música") && !(r.tax_cicles_str ?? "").includes("Robert Gerhard")));
});

test("filterAuditoriMusicEvents keeps a real Robert Gerhard Biennial record even with an empty ecategory (real retained record)", async () => {
  const records = await loadFixtureJson("auditori-events-merged-sample.json");
  const { musicRecords } = filterAuditoriMusicEvents(records);
  assert.ok(musicRecords.some((r) => r.wp_post?.post_title === "The Conference of the Birds"));
});

test("normaliseAuditoriRecord decodes HTML entities and cross-lists a real hall name (Palau de la Música Catalana)", async () => {
  const records = await loadFixtureJson("auditori-events-merged-sample.json");
  const raw = records.find((r) => r.hall_obj?.wp_post?.post_title === "Palau de la Música Catalana");
  assert.ok(raw);
  const record = normaliseAuditoriRecord(raw);
  assert.equal(record.hall, "Palau de la Música Catalana");
  assert.equal(record.title, "The OBC at the Palau de la Música");
  assert.ok(!AUDITORI_OWN_HALLS.has(record.hall));
});

test("normaliseAuditoriRecord recognises L'Auditori's own halls", async () => {
  const records = await loadFixtureJson("auditori-events-merged-sample.json");
  const raw = records.find((r) => r.hall_obj?.wp_post?.post_title === "Sala 1 Pau Casals");
  assert.ok(raw);
  const record = normaliseAuditoriRecord(raw);
  assert.ok(AUDITORI_OWN_HALLS.has(record.hall));
});

test("toObservation derives a UTC_INSTANT start from event_next_date_unix, cross-checked against event_date_text", () => {
  const observation = toObservation(
    { source_record_id: "1", title: "T", event_next_date_unix: 1788627600, event_date_text: "September 5, 2026 · 7 p.m.", hall: "Sala 1 Pau Casals" },
    { retrievedAt: "2026-08-26T00:00:00.000Z" },
  );
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.start.date, "2026-09-05");
  assert.equal(observation.venue_name, "Sala 1 Pau Casals");
});

test("toObservation falls back to TEXT_ONLY when no unix timestamp is present, never fabricating one", () => {
  const observation = toObservation({ source_record_id: "1", title: "T", event_date_text: "From October 2026 to June 2027" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observation.start.certainty, "TEXT_ONLY");
  assert.equal(observation.start.date, null);
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}), /non-empty source_record_id/);
});

test("toObservations maps real retained cross-listed halls independently", async () => {
  const records = await loadFixtureJson("auditori-events-merged-sample.json");
  const { musicRecords } = filterAuditoriMusicEvents(records);
  const normalised = musicRecords.map(normaliseAuditoriRecord);
  const observations = toObservations(normalised, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.ok(observations.length > 100);
  assert.ok(new Set(observations.map((o) => o.venue_name)).size > 5);
});
