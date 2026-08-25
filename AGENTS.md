# Band on the Map — Agent Instructions

This file exists for non-Claude coding agents. It intentionally mirrors
`CLAUDE.md` rather than maintaining a second, divergent policy — see that
file (or, for the full canonical policy,
`docs/SOURCE_INVESTIGATION_POLICY.md`) for the current content.

Before investigating any event website, venue calendar, or candidate data
source, read `docs/SOURCE_INVESTIGATION_POLICY.md` in full. In short:

- scratchpad-only material findings are prohibited;
- retained investigation/evidence files under
  `research/source-investigations/<investigation-id>/` are mandatory;
- the escalation ladder (`probe_history`) must be populated as the
  investigation proceeds, never backfilled after the fact — browser/headless
  work (Level 3+) requires real, retained Level 1/2 attempts marked
  `INSUFFICIENT` first;
- investigation must never activate a source — that requires a separate,
  explicitly-authorised action;
- unknown facts must never be invented;
- existing canonical/public data must not be mutated during investigation.
