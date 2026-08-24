# example-static-html-ready-01 (SYNTHETIC GOVERNANCE FIXTURE)

This is not a real investigation of a real venue. It is a synthetic,
fully-worked example committed under
`BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01` so that:

- `tests/source-investigation-validate.test.mjs` has a real, retained,
  on-disk `investigation.json` + evidence file to validate end-to-end
  (structural rules, evidence-file-existence, and every
  `READY_FOR_ACTIVATION` gate) without inventing evidence inline inside a
  test;
- `npm run validate:source-investigations` has something real to walk and
  report on.

`official_url` points at `https://example.org/agenda` —
`example.org` is reserved by IANA for documentation (RFC 2606) and is
never a real live-music venue. `evidence/agenda.html` was authored
directly for this fixture, not fetched from a live site.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per
`docs/SOURCE_INVESTIGATION_POLICY.md`.

Do not treat this fixture as a template for skipping investigation
stages — it deliberately shows a **complete** investigation (identity →
classification → data-path discovery → field assessment → offline proof →
decision), not a shortcut.
