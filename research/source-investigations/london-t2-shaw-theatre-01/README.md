# Shaw Theatre — Level 1 passive-static investigation (tranche 2)

Supersedes `triage-osm-node-332118767-london-01`. Two bounded unauthenticated GETs (homepage, then the candidate-supplied official_programme_url) both returned a Nuxt.js client-rendered shell; the programme page's own hydration payload shows its backend API call errored. Decision: `DEFER` (client-rendered, inconclusive; a JSON API pattern was discovered but not confirmed working). See `investigation.json` for the authoritative record.
