# Berlin dedicated research-worker browser proof

This directory retains the bounded, sanitized output of GitHub Actions run
[`33130374554`](https://github.com/chriswatson6675/band_on_the_map/actions/runs/33130374554).
The manual workflow ran controller commit
`e99885f157bd83c58306a44c3e90cb4d0748f386` against the exact detached browser
candidate `21412d227eb302b60c541ce41cccd9cb0b5ace86` on the isolated
`beatmapped-research-worker-01` host.

## Result

- The corpus was derived by the candidate rather than hard-coded: 27
  `OTHER_EMBEDDED_APP_STATE` plus 15 `CLIENT_RENDERED_UNKNOWN`, 42 total.
- All 42 venues were attempted at concurrency 1.
- Ten probes found programme material: one embedded programme state and nine
  rendered-DOM programmes.
- Thirty found no current programme and were routed to `AI_RESEARCH_REQUIRED`.
- Two failed technically because cookie overlays intercepted a bounded click;
  both were routed to `RETRY_LATER` and the queue continued.
- No structured endpoint was discovered, so no deterministic acquisition,
  persistence/revalidation, source activation, venue activation, or event
  publication occurred.
- Worker isolation, artifact sanitization, run-owned cleanup, and the overall
  workflow all passed. The ephemeral runner unregistered after this job.

## Governance boundary

These files prove execution and route follow-up research. They do not promote
any candidate, establish activation-ready source facts, or mutate canonical or
public data. A source-specific decision must still use a governed retained
investigation under `research/source-investigations/` and comply with
`docs/SOURCE_INVESTIGATION_POLICY.md`. The browser classifications here are not
authority to activate or publish.

The files are the workflow's twice-sanitized artifacts. Raw page captures,
credentials, private keys, host addresses, production data, and temporary
checkouts are not retained here.
