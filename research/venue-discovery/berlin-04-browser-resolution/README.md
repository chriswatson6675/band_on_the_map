# Generic controlled-browser endpoint resolution

This package adds a city-agnostic, bounded Playwright Core resolver and browser-to-deterministic-collector handoff. It does not activate sources or venues and does not publish or deploy.

## Browser audit

### Existing and reusable

JSON-LD/Observation ingestion, the SvelteKit data decoder, programme fingerprints, research-state routing, governed escalation, and credential redaction/audit were reused.

### Exists but not suitable

Prior retained browser observations are governed evidence, not an executable lifecycle worker. The lockfile's optional transitive `@playwright/test` reference was not an installed project stack.

### Missing before this package

A browser lifecycle owner, network interception, strict capture bounds, structural endpoint classifier, persisted handoff, and deterministic revalidation path.

## Execution model

The adapter requires an explicit system Chromium path and creates a fresh browser context without retained authentication state. The default probe allows 20 seconds for navigation, 35 seconds total, 40 eligible network responses, 256 KiB per inspected/retained body, one obvious load-more interaction, a 1.5-second post-load wait, and same-origin structured responses only. Unknown or excessive response lengths are metadata-only. Cleanup runs in `finally`.

The browser is a resolver, not the routine collector. A proven endpoint is persisted and revalidated through ordinary deterministic acquisition; browser resolution returns only if that validation fails or the mechanism changes.

## Berlin regression status

The ledger mechanically identifies 42 PROVEN Berlin venues with embedded/client-rendered residue. All 42 have retained Level 1 and Level 2 `INSUFFICIENT` evidence and are eligible for governed Level 3. No controlled backend was connected in this run, so each has the honest primary result `TECHNICAL_PROBE_FAILURE` / `RETRY_LATER`; no endpoint or acquisition proof is claimed.

## DigitalOcean

The worker needs Node.js, `playwright-core`, an explicitly installed Chromium executable and its Linux libraries. No browser binary is bundled. Start at concurrency 1 until actual host memory/CPU measurements exist. Routine deterministic collection should not launch Chromium.

## Recommendation

`ANOTHER_GENERIC_BLOCKER_BEFORE_LONDON`: the generic code path exists and is fixture-proven, but it still requires a connected controlled Chromium regression run and real resource measurements before a large autonomous London scope.
