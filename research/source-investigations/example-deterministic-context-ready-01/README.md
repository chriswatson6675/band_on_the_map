# example-deterministic-context-ready-01 (SYNTHETIC GOVERNANCE FIXTURE, policy v1.2)

This is not a real investigation of a real venue. It is a synthetic,
fully-worked example committed under
`BOTM-GIG-FACT-DERIVATION-GOVERNANCE-02` (policy version
`BOTM-SOURCE-INVESTIGATION-v1.2`) so that:

- `tests/source-investigation-v1_2.test.mjs` has a real, retained,
  on-disk `investigation.json` + evidence to validate end-to-end under
  v1.2's new field-value-basis rules, without inventing evidence inline
  inside a test;
- `npm run validate:source-investigations` has a genuine v1.2 record to
  walk and report on, alongside the pre-existing v1.1 records.

## What this fixture demonstrates

The retained page (`evidence/programme.html`) deliberately mirrors the
real-world pattern `BOTM-DIFFICULT-SOURCE-TRIAL-01` exposed: an event row
does **not** repeat context that is already established once, higher up
the page:

- a `<h2>` heading states **"September 2026"** once; the event row states
  only the day, **"17"**;
- a `<section data-venue-name="Sala X">` names the venue once; the event
  row inside it never repeats "Sala X";
- a `<section data-price-label="Entrada livre">` states free admission
  once; the event row inside it never repeats a price.

`investigation.json` records all three as `state: "PROVEN"`,
`basis: "DETERMINISTIC_CONTEXT"`, each with a `derivation` object citing
the exact inputs combined and the mechanical rule used — and
`evidence/offline-proof.mjs` proves, with zero network access and zero AI
judgement, that combining those inputs really does yield exactly one
result each time it runs (`evidence/offline-proof-output.txt` is its
captured, deterministic output).

`title`, `source_record_id`, and `event_url` are `basis: "DIRECT_SOURCE"`
instead — each is stated directly by the event row itself, with nothing
to combine.

`time` stays `PARTIAL` with `value: null` and `basis: null` — a floating
local time with no stated timezone is honestly under-determined, not
promoted to a precise claim, per the same anti-fabrication principle v1.1
already established.

## Why this is not guessing

Every `DETERMINISTIC_CONTEXT` claim here traces to a **structural**
containment relationship the source itself encodes (the event row is
literally nested inside the section that names its venue/price, and
`offline-proof.mjs` checks that containment mechanically) — never to
"today's date," "this venue usually...," or "it's probably obvious."
`docs/SOURCE_INVESTIGATION_POLICY.md`'s v1.2 section explains the
distinction, and the contract's `derivation.rule` phrase-detector would
reject a rule text that leaned on plausibility language instead.

`official_url` points at `https://example.org/programme` — `example.org`
is reserved by IANA for documentation (RFC 2606) and is never a real
live-music venue. All evidence files were authored directly for this
fixture, not fetched from a live site.

`investigation.json` is the authoritative structured record. This file is
explanatory only.
