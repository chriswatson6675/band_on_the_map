# L'Auditori Barcelona recovery investigation 02

This is the fresh, governed recovery investigation for `l-auditori-barcelona`, superseding—not rewriting—`l-auditori-barcelona-01`.

Level 1 isolated the production-visible generic `fetch failed` to Node TLS verification: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. The official page and existing AJAX endpoint remain publicly reachable and return HTTP 200 through the operating-system trust path. A normally validated TLS inspection identified L'Auditori's exact Sectigo OV R36 -> R46 chain, which Node's bundled trust material cannot build from this connection.

The smallest correction is a source-scoped HTTPS transport carrying that retained public CA chain. Certificate and hostname verification remain enabled; the timeout remains bounded; no other source's trust path changes. Fourteen focused offline tests pass. A genuine live run then acquired 239 raw records, produced 161 music-programme Observations, and resolved 151 future listings across the same nine canonical venues through the normal Spain pipeline. Ten out-of-region, one-off outdoor, or indeterminate-hall observations remained unresolved, exactly as the existing mappings require.

The final governed decision is `READY_FOR_ACTIVATION`. That is an investigation recommendation only: this work changes no source registry, venue registry, retention policy, public artifact, or production state, and it does not activate, publish, deploy, or merge anything.
