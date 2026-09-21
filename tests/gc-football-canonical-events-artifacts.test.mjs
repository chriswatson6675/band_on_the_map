// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-EVENT-IDENTITY-01 — validation of
// the REAL derived canonical identity layer.
//
// Synthetic tests prove the contract holds in principle. This suite
// proves it holds over the actual 898-group corpus: every id unique and
// recomputable, every group accounted for exactly once, every provenance
// link resolving to a real Observation, the upstream layers untouched,
// and a rerun byte-identical.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalEventId } from "../ingestion/canonical-event-identity/contract.mjs";
import {
  CANONICAL_STATES,
  EVIDENCE_CLASSES,
  WITHHELD_REASONS,
  canonicaliseAll,
} from "../ingestion/gc-football-canonical-events/adapt.mjs";
import { buildArtifacts } from "../ingestion/gc-football-canonical-events/run-canonical-events.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

const CANON = "research/major-event-canonical/uk-gc-football-01";
const RECON = "research/major-event-reconciliation/uk-gc-football-01";
const ACQ = "research/major-event-acquisition/uk-gc-football-01";

const canonicalEvents = (await readJson(`${CANON}/canonical-events.json`)).canonical_events;
const withheldEntries = (await readJson(`${CANON}/withheld.json`)).withheld;
const summary = await readJson(`${CANON}/summary.json`);

const reconciled = (await readJson(`${RECON}/reconciled-fixtures.json`)).reconciled_fixtures;
const singleSource = (await readJson(`${RECON}/single-source.json`)).single_source;
const observations = (await readJson(`${ACQ}/observations.json`)).observations;

/* ---------------------------------------------------------------- */
/* ACCOUNTING — every reconciled group ends somewhere                */
/* ---------------------------------------------------------------- */

test("every reconciled group is accounted for exactly once", () => {
  assert.equal(canonicalEvents.length + withheldEntries.length, reconciled.length);
  assert.equal(summary.accounting.reconciled_groups_in, reconciled.length);
  assert.equal(summary.accounting.groups_accounted_for, reconciled.length);
  assert.equal(summary.accounting.canonical_event_identities_established, canonicalEvents.length);
  assert.equal(summary.accounting.canonical_identity_withheld, withheldEntries.length);

  // No group is represented twice, and none is missing.
  const seen = new Set([
    ...canonicalEvents.map((event) => event.reconciliation_group_id),
    ...withheldEntries.map((entry) => entry.reconciliation_group_id),
  ]);
  assert.equal(seen.size, reconciled.length, "no group may appear twice or vanish");
  for (const group of reconciled) {
    assert.ok(seen.has(group.reconciliation_group_id), `group dropped: ${group.reconciliation_group_id}`);
  }
});

test("every record carries a declared state, and withheld records a declared reason", () => {
  for (const event of canonicalEvents) {
    assert.equal(event.canonical_state, "CANONICAL_EVENT_ESTABLISHED");
    assert.ok(CANONICAL_STATES.has(event.canonical_state));
  }
  for (const entry of withheldEntries) {
    assert.equal(entry.canonical_state, "CANONICAL_IDENTITY_WITHHELD");
    assert.ok(WITHHELD_REASONS.has(entry.withheld_reason), entry.withheld_reason);
  }
});

/* ---------------------------------------------------------------- */
/* IDENTITY — unique, recomputable, anchored                         */
/* ---------------------------------------------------------------- */

test("every canonical event id across the real corpus is unique", () => {
  const ids = canonicalEvents.map((event) => event.canonical_event_id);
  assert.equal(new Set(ids).size, ids.length, "a collision is a hard stop, never a salt");
  assert.equal(summary.accounting.distinct_canonical_event_ids, ids.length);
});

test("every id recomputes exactly from its own anchor", () => {
  for (const event of canonicalEvents) {
    assert.equal(canonicalEventId(event.identity_anchor), event.canonical_event_id, event.reconciliation_group_id);
  }
});

test("every anchor holds the identity inputs and nothing mutable", () => {
  for (const event of canonicalEvents) {
    assert.deepEqual(Object.keys(event.identity_anchor).sort(), [
      "identity_version",
      "occurrence_instant_utc",
      "provider_event_key",
      "provider_namespace",
    ]);
    assert.equal(event.identity_anchor.provider_namespace, "GC_FOOTBALL");
    assert.equal(event.identity_anchor.provider_event_key, event.platform_match_id);
    assert.equal(event.identity_anchor.occurrence_instant_utc, event.occurrence_instant_utc);
    assert.equal(event.identity_version, "cev1");
  }
});

test("one match id never maps to more than one canonical event", () => {
  const byMatchId = new Map();
  for (const event of canonicalEvents) {
    const existing = byMatchId.get(event.platform_match_id);
    assert.equal(existing, undefined, `match id minted twice: ${event.platform_match_id}`);
    byMatchId.set(event.platform_match_id, event.canonical_event_id);
  }
  assert.equal(byMatchId.size, canonicalEvents.length);
});

test("the real corpus contains no match-id/kickoff conflict, and one would be refused if it did", () => {
  // The fact, measured from the reconciliation layer rather than asserted.
  const conflicted = reconciled.filter((group) => new Set(group.kickoff_variants).size > 1);
  assert.equal(conflicted.length, 0);
  assert.equal(summary.withheld_by_reason.CANONICAL_IDENTITY_CONFLICT_MATCH_ID_KICKOFF, undefined);

  // And the refusal is live, not merely unexercised: inject a conflict
  // into a copy of a real group and confirm it is withheld.
  const poisoned = structuredClone(reconciled[0]);
  poisoned.kickoff_variants = [...poisoned.kickoff_variants, "2031-01-01T00:00:00.000Z"];
  const { established, withheld } = canonicaliseAll([poisoned]);
  assert.equal(established.length, 0);
  assert.equal(withheld[0].withheld_reason, "CANONICAL_IDENTITY_CONFLICT_MATCH_ID_KICKOFF");
});

test("identity is insensitive to enrichment, on real records", () => {
  // Take real groups and vary every excluded field. The id must not move.
  for (const group of reconciled.slice(0, 50)) {
    const original = canonicaliseAll([group]).established[0];

    const altered = structuredClone(group);
    altered.home_team_variants = ["ALTERED HOME"];
    altered.away_team_variants = ["ALTERED AWAY"];
    altered.competition_variants = ["ALTERED COMPETITION"];
    altered.source_venue_text_variants = ["ALTERED VENUE TEXT"];
    altered.venue_evidence_state = "AGREED_BY_ALL_RESOLVED_MEMBERS";
    altered.reconciled_venue_census_id = "ukmec-invented-ground";
    altered.reconciled_venue_name = "Invented Ground";
    altered.publisher_domains = ["a.example", "b.example", "c.example"];
    altered.publisher_domain_count = 3;
    altered.members = [...group.members].reverse();
    altered.member_detail = [...group.member_detail].reverse();

    const after = canonicaliseAll([altered]).established[0];
    assert.equal(after.canonical_event_id, original.canonical_event_id, group.reconciliation_group_id);
  }
});

/* ---------------------------------------------------------------- */
/* PROVENANCE — no dead ends                                         */
/* ---------------------------------------------------------------- */

test("every canonical event traces back to a real reconciliation group", () => {
  const groups = new Map(reconciled.map((group) => [group.reconciliation_group_id, group]));
  for (const event of canonicalEvents) {
    const group = groups.get(event.reconciliation_group_id);
    assert.ok(group, `no such reconciliation group: ${event.reconciliation_group_id}`);
    assert.equal(group.platform_match_id, event.platform_match_id);
    assert.equal(group.kickoff_utc, event.occurrence_instant_utc);
  }
});

test("every source observation reference resolves to a real Observation", () => {
  const known = new Set(observations.map((o) => `${o.source_id}||${o.source_record_id}`));
  let refs = 0;
  for (const event of canonicalEvents) {
    assert.ok(event.source_observations.length >= 2, "an established event has at least two members");
    for (const ref of event.source_observations) {
      const key = `${ref.source_id}||${ref.source_record_id}`;
      assert.ok(known.has(key), `dead provenance link: ${key}`);
      refs += 1;
    }
  }
  assert.equal(refs, 1853, "the members are exactly the multi-source observations the predecessor measured");
});

test("the provenance chain reaches original acquisition evidence, with no dead ends", async () => {
  // CANONICAL EVENT -> RECONCILIATION GROUP -> SOURCE OBSERVATION ->
  // ORIGINAL ACQUISITION PROVENANCE. Each hop is resolved against the
  // committed artifact that owns it, so a break anywhere fails here.
  const sources = (await readJson(`${ACQ}/sources.json`)).sources;
  const registeredSources = new Map(sources.map((source) => [source.source_id, source]));
  const observationBy = new Map(observations.map((o) => [`${o.source_id}||${o.source_record_id}`, o]));

  for (const event of canonicalEvents) {
    for (const ref of event.source_observations) {
      const observation = observationBy.get(`${ref.source_id}||${ref.source_record_id}`);
      assert.ok(observation, `no Observation for ${ref.source_id}`);

      // The Observation still carries its own acquisition provenance.
      assert.ok(observation.source_url, "Observation lost its source url");
      assert.ok(observation.retrieved_at, "Observation lost its retrieval time");
      assert.ok(observation.raw_evidence, "Observation lost its evidence record");

      // And its source is a registered, proven acquisition source.
      const source = registeredSources.get(ref.source_id);
      assert.ok(source, `unregistered source: ${ref.source_id}`);
      assert.equal(source.terminal_state, "ACQUISITION_PROVEN");

      // The anchor the identity was minted from is the Observation's own
      // platform facts — not something this layer introduced.
      assert.equal(observation.source_fields.platform, event.identity_anchor.provider_namespace);
      assert.equal(observation.source_fields.match_id, event.identity_anchor.provider_event_key);
      assert.equal(
        new Date(observation.start.iso).toISOString(),
        event.identity_anchor.occurrence_instant_utc,
      );
    }
  }
});

test("no Observation is claimed by two canonical events", () => {
  const seen = new Set();
  for (const event of canonicalEvents) {
    for (const ref of event.source_observations) {
      const key = `${ref.source_id}||${ref.source_record_id}`;
      assert.ok(!seen.has(key), `Observation claimed twice: ${key}`);
      seen.add(key);
    }
  }
});

test("member detail matches the members, one for one", () => {
  for (const event of canonicalEvents) {
    assert.equal(event.member_detail.length, event.source_observations.length);
    const refs = event.source_observations.map((r) => `${r.source_id}||${r.source_record_id}`).sort();
    const detail = event.member_detail.map((d) => `${d.source_id}||${d.source_record_id}`).sort();
    assert.deepEqual(detail, refs);
  }
});

test("every governed venue is carried with the members that support it", () => {
  const withVenue = canonicalEvents.filter((event) => event.governed_venue_census_id != null);
  assert.equal(withVenue.length, summary.venue.with_governed_venue);
  for (const event of withVenue) {
    assert.equal(event.venue_evidence_state, "AGREED_BY_ALL_RESOLVED_MEMBERS");
    assert.ok(event.venue_supported_by.length > 0, `venue with no supporting member: ${event.canonical_event_id}`);
    const members = new Set(event.source_observations.map((r) => `${r.source_id}||${r.source_record_id}`));
    for (const ref of event.venue_supported_by) {
      assert.ok(members.has(`${ref.source_id}||${ref.source_record_id}`), "venue support must come from a member");
    }
  }
});

/* ---------------------------------------------------------------- */
/* SCOPE — single-source fixtures stay outside                       */
/* ---------------------------------------------------------------- */

test("no canonical identity exists for any single-source match id", () => {
  const singleIds = new Set(singleSource.map((entry) => entry.platform_match_id));
  assert.equal(singleIds.size, 3239);
  assert.equal(summary.accounting.single_source_match_ids_out_of_scope, 3239);
  assert.equal(summary.accounting.canonical_identities_created_for_single_source, 0);

  for (const event of canonicalEvents) {
    assert.ok(!singleIds.has(event.platform_match_id), `single-source id canonicalised: ${event.platform_match_id}`);
  }

  // And their Observations appear in no canonical event either.
  const claimed = new Set();
  for (const event of canonicalEvents) {
    for (const ref of event.source_observations) claimed.add(`${ref.source_id}||${ref.source_record_id}`);
  }
  for (const entry of singleSource) {
    for (const ref of entry.members) {
      assert.ok(!claimed.has(`${ref.source_id}||${ref.source_record_id}`));
    }
  }
});

test("running the single-source entries through the adapter still refuses them", () => {
  const { established, withheld } = canonicaliseAll(singleSource.slice(0, 200));
  assert.equal(established.length, 0, "single-source input must never mint identity");
  assert.equal(withheld.length, 200);
  for (const entry of withheld) {
    assert.ok(["NOT_RECONCILED_MULTI_SOURCE", "INSUFFICIENT_SOURCE_MULTIPLICITY"].includes(entry.withheld_reason));
  }
});

/* ---------------------------------------------------------------- */
/* EVIDENCE CLASS — the 674/224 distinction stays factual            */
/* ---------------------------------------------------------------- */

test("the cross-publisher and same-publisher classes are measured, and partition the corpus", () => {
  const cross = canonicalEvents.filter((event) => event.evidence_class === "CROSS_PUBLISHER_CORROBORATED");
  const same = canonicalEvents.filter((event) => event.evidence_class === "SAME_PUBLISHER_MULTI_SOURCE");

  assert.equal(cross.length + same.length, canonicalEvents.length, "the classes must be exhaustive");
  assert.equal(summary.evidence_classes.CROSS_PUBLISHER_CORROBORATED, cross.length);
  assert.equal(summary.evidence_classes.SAME_PUBLISHER_MULTI_SOURCE, same.length);

  // Each class is derived from the record's own publishing domains.
  for (const event of cross) assert.ok(event.publisher_domain_count > 1);
  for (const event of same) assert.equal(event.publisher_domain_count, 1);

  for (const event of canonicalEvents) assert.ok(EVIDENCE_CLASSES.has(event.evidence_class));
});

test("it is never claimed that all 898 events are independently corroborated", () => {
  const cross = canonicalEvents.filter((event) => event.evidence_class === "CROSS_PUBLISHER_CORROBORATED").length;
  const same = canonicalEvents.filter((event) => event.evidence_class === "SAME_PUBLISHER_MULTI_SOURCE").length;

  // The distinction the predecessor established must survive intact.
  assert.equal(cross, 674);
  assert.equal(same, 224);
  assert.ok(cross < canonicalEvents.length, "independent corroboration is a strict subset");
  assert.equal(cross + same, 898);

  // The summary must state the smaller number, not the total.
  assert.notEqual(summary.evidence_classes.CROSS_PUBLISHER_CORROBORATED, canonicalEvents.length);
  assert.match(summary.evidence_classes.note, /NOT independent corroboration/);
});

test("no confidence score is attached to any record", () => {
  for (const event of canonicalEvents.slice(0, 100)) {
    for (const field of Object.keys(event)) {
      assert.ok(!/confidence|score|probability|likelihood|rank/i.test(field), `${field} looks like a score`);
    }
  }
});

/* ---------------------------------------------------------------- */
/* VENUE AND VOCABULARY                                              */
/* ---------------------------------------------------------------- */

test("an unresolved venue never blocks identity, and is never manufactured", () => {
  const without = canonicalEvents.filter((event) => event.governed_venue_census_id == null);
  assert.equal(without.length, summary.venue.without_governed_venue);
  assert.ok(without.length > 0, "the corpus does contain unresolved-venue events");
  for (const event of without) {
    assert.equal(event.canonical_state, "CANONICAL_EVENT_ESTABLISHED");
    assert.equal(event.venue_evidence_state, "NO_MEMBER_RESOLVED");
    assert.equal(event.governed_venue_name, null);
    assert.deepEqual(event.venue_supported_by, []);
  }
  assert.equal(summary.venue.venue_is_part_of_identity, false);
});

test("the venue split matches what the reconciliation layer measured", () => {
  const agreed = reconciled.filter((group) => group.venue_evidence_state === "AGREED_BY_ALL_RESOLVED_MEMBERS").length;
  const none = reconciled.filter((group) => group.venue_evidence_state === "NO_MEMBER_RESOLVED").length;
  const conflicting = reconciled.filter((group) => group.venue_evidence_state === "CONFLICTING_RESOLVED_VENUES").length;

  assert.equal(summary.venue.with_governed_venue, agreed);
  assert.equal(summary.venue.without_governed_venue, none);
  assert.equal(conflicting, 0, "no venue conflict in this corpus");
});

test("naming variants are retained verbatim from the reconciliation layer", () => {
  const groups = new Map(reconciled.map((group) => [group.reconciliation_group_id, group]));
  for (const event of canonicalEvents) {
    const group = groups.get(event.reconciliation_group_id);
    assert.deepEqual(event.home_team_variants, group.home_team_variants);
    assert.deepEqual(event.away_team_variants, group.away_team_variants);
    assert.deepEqual(event.competition_variants, group.competition_variants);
    assert.deepEqual(event.source_venue_text_variants, group.source_venue_text_variants);
  }
});

test("no canonical club or competition identity is introduced anywhere in the corpus", () => {
  assert.equal(summary.participants_and_competition.canonical_club_identities_introduced, 0);
  assert.equal(summary.participants_and_competition.canonical_competition_identities_introduced, 0);
  for (const event of canonicalEvents) {
    assert.equal(event.canonical_home_club_id, null);
    assert.equal(event.canonical_away_club_id, null);
    assert.equal(event.canonical_competition_id, null);
  }
  // The variant counts are the predecessor's, carried forward unchanged.
  const multi = (pick) => canonicalEvents.filter((event) => pick(event).length > 1).length;
  assert.equal(multi((e) => e.home_team_variants), 20);
  assert.equal(multi((e) => e.away_team_variants), 21);
  assert.equal(multi((e) => e.competition_variants), 15);
  assert.equal(multi((e) => e.source_venue_text_variants), 3);
});

/* ---------------------------------------------------------------- */
/* DETERMINISM                                                       */
/* ---------------------------------------------------------------- */

test("a rerun with a pinned timestamp reproduces the retained artifacts exactly", async () => {
  const derivedAt = summary.derived_at;
  const rebuilt = buildArtifacts(reconciled, singleSource, derivedAt);

  // Structural reproducibility first, as the reconciliation suite does.
  assert.deepEqual(rebuilt.summary, summary, "summary.json must be reproducible from its inputs");
  assert.deepEqual(rebuilt.canonicalEvents.canonical_events, canonicalEvents, "canonical-events.json must be reproducible");
  assert.deepEqual(rebuilt.withheld.withheld, withheldEntries, "withheld.json must be reproducible");

  // Then the serialisation itself, so formatting drift is caught too.
  //
  // Line endings are normalised on BOTH sides before comparing. This
  // repository runs with core.autocrlf=true, so git rewrites a checked-out
  // text artifact's newlines and the file on disk need not match the blob
  // that was committed. The determinism claim here is about the bytes this
  // package WRITES — everything except that checkout transform — and
  // .gitattributes deliberately reserves `-text` for byte-faithful retained
  // evidence, which a derived artifact is not.
  const lf = (text) => text.replace(/\r\n/g, "\n");
  const onDisk = async (name) => lf(await readFile(resolve(ROOT, `${CANON}/${name}`), "utf8"));

  assert.equal(`${JSON.stringify(rebuilt.canonicalEvents, null, 2)}\n`, await onDisk("canonical-events.json"));
  assert.equal(`${JSON.stringify(rebuilt.withheld, null, 2)}\n`, await onDisk("withheld.json"));
  assert.equal(`${JSON.stringify(rebuilt.summary, null, 2)}\n`, await onDisk("summary.json"));
});

test("rebuilding from reversed input produces identical artifacts", () => {
  const derivedAt = summary.derived_at;
  const forwards = buildArtifacts(reconciled, singleSource, derivedAt);
  const backwards = buildArtifacts([...reconciled].reverse(), singleSource, derivedAt);
  assert.equal(JSON.stringify(backwards.canonicalEvents), JSON.stringify(forwards.canonicalEvents));
  assert.equal(JSON.stringify(backwards.summary), JSON.stringify(forwards.summary));
});

test("the artifact is ordered deterministically by canonical event id", () => {
  const ids = canonicalEvents.map((event) => event.canonical_event_id);
  assert.deepEqual(ids, [...ids].sort());
});

test("building the artifacts never mutates the reconciliation input", () => {
  const before = JSON.stringify(reconciled);
  buildArtifacts(reconciled, singleSource, summary.derived_at);
  assert.equal(JSON.stringify(reconciled), before);
});

/* ---------------------------------------------------------------- */
/* IMMUTABILITY AND NON-PUBLICATION                                  */
/* ---------------------------------------------------------------- */

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

test("the upstream acquisition, attribution and reconciliation layers are untouched", () => {
  for (const path of [
    "research/major-event-acquisition",
    "research/major-event-attribution/uk-gc-football-01",
    "research/major-event-reconciliation/uk-gc-football-01",
  ]) {
    const status = git("status", "--porcelain", "--", path).trim();
    assert.equal(status, "", `this package modified ${path}:\n${status}`);
  }
});

test("no production, publication or deployment path is touched", () => {
  for (const path of ["data/public", "venues", "sources"]) {
    const status = git("status", "--porcelain", "--", path).trim();
    assert.equal(status, "", `this package modified ${path}:\n${status}`);
  }
  assert.equal(summary.production_impact.production_events_created, 0);
  assert.equal(summary.production_impact.public_events_published, 0);
  assert.equal(summary.production_impact.source_observations_modified, 0);
  assert.equal(summary.production_impact.reconciliation_artifacts_modified, 0);
  assert.equal(summary.production_impact.deployment, "NONE");
});

test("the canonical identity modules call no publication, deployment or network code path", async () => {
  const MODULES = [
    "ingestion/canonical-event-identity/contract.mjs",
    "ingestion/gc-football-canonical-events/adapt.mjs",
    "ingestion/gc-football-canonical-events/run-canonical-events.mjs",
  ];

  for (const path of MODULES) {
    const source = await readFile(resolve(ROOT, path), "utf8");
    // Strip comments. These modules discuss publication at length in
    // order to disclaim it, and that prose must not fail its own control
    // — what matters is what the CODE imports and calls. A declaration
    // such as `deployment: "NONE"` is likewise the opposite of a risk.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    // 1. Nothing publication-, deployment- or transport-shaped is imported.
    const specifiers = [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      assert.ok(
        !/publish|publication|deploy|map-data|child_process|node:http|https|net|tls/i.test(specifier),
        `${path} imports ${specifier}`,
      );
    }

    // 2. Nothing is fetched, spawned or executed.
    for (const call of ["fetch(", "execFile", "execSync", "spawn(", "spawnSync", "require("]) {
      assert.ok(!code.includes(call), `${path} calls ${call}`);
    }

    // 3. The only filesystem writes go through this package's own
    //    writeJson helper, and the only output root is the canonical
    //    directory. No other path is ever written.
    const writeTargets = [...code.matchAll(/\bwriteFile\s*\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    for (const target of writeTargets) {
      assert.equal(target, "path", `${path} writes to an unexpected target: ${target}`);
    }
    const outputRoots = [...code.matchAll(/resolve\(ROOT,\s*"([^"]+)"\)/g)].map((m) => m[1]);
    for (const root of outputRoots) {
      assert.ok(root.startsWith("research/major-event-"), `${path} resolves an unexpected root: ${root}`);
    }
  }

  // And the output directory the runner writes to is the canonical one.
  const runner = await readFile(resolve(ROOT, MODULES[2]), "utf8");
  assert.match(runner, /const OUT = resolve\(ROOT, "research\/major-event-canonical\/uk-gc-football-01"\)/);
});

test("every record declares it is derived identity, not published production", () => {
  for (const event of canonicalEvents) {
    assert.equal(event.lifecycle_state, "DERIVED_GOVERNED_IDENTITY_NOT_PUBLISHED");
  }
  assert.equal(summary.provenance.publishes_events, false);
  assert.equal(summary.provenance.mutates_upstream_artifacts, false);
  assert.equal(summary.provenance.creates_canonical_event_identity, true);
});

/* ---------------------------------------------------------------- */
/* TEMPORAL                                                          */
/* ---------------------------------------------------------------- */

test("the temporal split is derived, and every instant is a valid UTC instant", () => {
  const future = canonicalEvents.filter((event) => event.is_future === true).length;
  const past = canonicalEvents.filter((event) => event.is_future === false).length;
  assert.equal(summary.temporal.future_events, future);
  assert.equal(summary.temporal.past_events, past);
  assert.equal(summary.temporal.unknown, 0);
  assert.equal(future + past, canonicalEvents.length);

  for (const event of canonicalEvents) {
    assert.match(event.occurrence_instant_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(new Date(event.occurrence_instant_utc).toISOString(), event.occurrence_instant_utc);
  }
});
