# Self-referential JSON-LD Event URL identity — IP-1 correction

Task: `BEATMAPPED-JSON-LD-SELF-REFERENTIAL-EVENT-URL-IDENTITY-01`
Base: `676b53d11d2669b2aa1100fa2d8b35e62226cb36` (`origin/main`).
Follows `BEATMAPPED-BERLIN-STABLE-IDENTITY-PROOF-GATE-01`
(`BERLIN_STABLE_IDENTITY_PROOF_TRIAGE_COMPLETE`).

## Base choice

The triage branch was based on `3161494` because Huxleys/Radialsystem need its
text-date normalisation. **This correction has no such dependency.** `3161494`
touches only `ingestion/static-cards/` and its tests; it does not touch
`offline-proof.mjs`, the JSON-LD collector, or anything in the proof path.

IP-1 was re-reproduced on unmodified `origin/main` and behaves identically:

| source | mechanism | normalized | proven | state |
|---|---|---|---|---|
| `tempodrom-berlin` | JSON_LD_EVENT | 151 | 0 | `STABLE_IDENTITY_PROOF_FAILED` |
| `waldbuehne-berlin` | STATIC_HTML_CARDS | 14 | 0 | `STABLE_IDENTITY_PROOF_FAILED` |

So the branch is cut from `main`. `3161494` was **not** merged.

## IP-1 reproduction (§2)

For both sources, across the 12 bounded detail candidates
(`evidence/*-ip1-reproduction.json`):

- 12 / 12 documents publish **no `rel=canonical`**;
- 11 documents carry a JSON-LD Event node (1 node each — never more);
- every one of those nodes has `name` and `startDate`;
- every one publishes `url` **absolute as published** (`^https?://`);
- every one is **self-referential** — `url` identifies the fetched document;
- **0** nodes publish any `@id`;
- current proof count: **0**;
- eligible under the proposed rule: **11 each, 11 distinct, no collisions**;
- byte-identical across two independent live acquisitions.

## Current canonical proof semantics (§3)

`proveCanonicalDetailEvents()` proved an event only from a document where a
published `rel=canonical` resolved **equal to the fetched URL**, which then
carried a JSON-LD `Event` with `name` + `startDate`, whose `url` (if present)
equalled that canonical, dated at or after the cutoff. Identity was always
`canonicalUrl`, recorded as
`source_record_id_basis: "SOURCE_PUBLISHED_CANONICAL_EVENT_URL"` with
`proof_kind: "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT"`.

The basis vocabulary is a descriptive `SCREAMING_SNAKE` convention on
`source_record_id_basis`, not a formal enum — the other existing value is
`URL_SLUG_PARTIAL_UNCONFIRMED_STABILITY`
(`ingestion/museu-do-fado/observation-adapter.mjs`). The new value follows that
convention rather than inventing a parallel model.

## The additive hierarchy

1. `SOURCE_PUBLISHED_CANONICAL_EVENT_URL` — **preferred, unchanged**.
2. `SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL` — only when **no canonical is
   declared at all**, and the Event node's own source-published **absolute**
   `url` identifies the fetched document itself.

A document that declares a canonical never reaches (2) — whether that canonical
agrees, disagrees, or is unreadable. `canonicalLinkDeclared()` exists precisely
to separate *absent* from *declared-but-unusable*: `canonicalUrlFromHtml()`
returns `null` for both, and treating the second as absence would bypass an
explicit publisher signal.

## Why this is safe where a fetched-URL fallback is not

The triage found tempodrom's first detail candidate is
`…/programm-und-tickets/?printpdf=1`. A "no canonical → use the fetched URL"
rule would mint an identity for that print variant. Requiring the **node's own
published, absolute, self-referential** `url` defeats it by construction: the
print variant carries no Event node, and had it carried one, its `url` would
name the clean page and fail self-referentiality. The same requirement is what
keeps a listing document's outbound nodes unprovable.

Additional narrowing beyond the brief: a document where **more than one** Event
node claims to be that document is rejected whole. Identity there is the
document's own URL, so two such nodes would mint one identity for two events
and the existing dedupe would silently keep the last. Measured cost: **zero** —
every eligible document in the cohort carries exactly one Event node.

## Results (§26) — bounded cohort, two runs each

| source | normalized | proven before | proven after | identity basis | terminal state |
|---|---|---|---|---|---|
| `tempodrom-berlin` | 151 | 0 | **11** | `SELF_REFERENTIAL` ×11 | `ACQUISITION_PROVEN` |
| `waldbuehne-berlin` | 14 | 0 | **11** | `SELF_REFERENTIAL` ×11 | `ACQUISITION_PROVEN` |
| `a-trane-berlin` | 11 | 0 | 0 | — | `STABLE_IDENTITY_PROOF_FAILED` |
| `konzerthaus-berlin` | 33 | 0 | 0 | — | `STABLE_IDENTITY_PROOF_FAILED` |
| `huxleys-neue-welt-berlin` | 0 on this base † | 0 | 0 | — | `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` |
| `radialsystem-berlin` | 0 on this base † | 0 | 0 | — | `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` |
| `b-flat-berlin` (control) | 9 | 9 | **9** | `CANONICAL` ×9 | `ACQUISITION_PROVEN` |
| `privatclub-berlin` (control) | 30 | 11 | **11** | `CANONICAL` ×11 | `ACQUISITION_PROVEN` |

† These two normalize 0 on `main` because they need `3161494`'s text-date
work. To verify the IP-2 negative control honestly, the **new** proof was run
against documents acquired on the base where they *do* normalize
(`evidence/ip2-negative-control-on-text-date-base.json`): huxleys 111
normalized and radialsystem 14 normalized, **0 proofs before, 0 after**. The
new basis cannot invent an Event node that does not exist.

Every proof identity was byte-identical across both runs, for all eight
sources.

## Retained files

- `evidence/<source>-ip1-reproduction.json` — §2 per-document/per-node preconditions, two runs
- `evidence/<source>-after.json`, `evidence/cohort-after.json` — §26 results, two runs
- `evidence/ip2-negative-control-on-text-date-base.json` — IP-2 control on the text-date base

## Explicitly unchanged

`detailLimit = 12`, detail-candidate ordering, the proof date regex, a-trane's
unpadded `startDate`, static-card text-date acquisition, collectors, routing,
programme resolution, `sources/berlin.json`, collision/dedupe policy, and every
proof threshold. Canonical proof objects are bit-for-bit unchanged — the
pre-existing `tests/offline-proof.test.mjs` `deepEqual` on the full proof object
passes untouched.
