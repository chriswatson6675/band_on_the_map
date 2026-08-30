# Generic venue research architecture

BeatMapped treats a city as input data and a regression corpus, never as a special runtime pipeline. Discovery adapters emit the same candidate contract for any city; reconciliation, research state, source fingerprinting, capability routing, and queue routing are shared code.

## Permanent rules

1. Candidate identity, current-place status, music relevance, venue likelihood, programme discovery, acquisition readiness, technical mechanism, collector compatibility, investigation limitations, and next action are separate concerns.
2. First-party acquisition is preferred, but it is not required to establish that a venue exists or materially hosts music. `PROVEN_CURRENT_MUSIC_VENUE + SOURCE_IDENTITY_UNRESOLVED` is valid.
3. A failed search, blocked request, or unreadable programme is an investigation limitation. It is never negative venue evidence or closure evidence.
4. Evidence records its purpose and provenance. Municipal/open-data, official social, recognised event-platform, and credible third-party evidence may establish venue status without silently becoming preferred acquisition sources.
5. Research normally progresses through identity reconciliation, official-site resolution, official programme discovery, structured fingerprinting, official social, recognised event platforms, credible third parties, deeper AI-assisted research, human judgement, then defer/retry.
6. Generic collector reuse is preferred in this order: existing zero-code family, configuration, generic widening, new reusable family, bounded bespoke handling. `LIKELY_BESPOKE` requires explicit proof that every reusable route was considered first.
7. Deterministic code performs routine reconciliation, fingerprinting, serialization, configuration, and authorised collection. AI resolves ambiguous identities and weak/social/third-party evidence. Canonical conflicts and activation remain human-gated.
8. Resolved knowledge persists with its evidence, unresolved reason, last verification state, and next action. Reverification updates that memory; a temporary access failure must not erase a previously proven venue status.
9. Unresolved candidates become machine-readable queue items rather than dead-end prose reports.
10. New cities automatically inherit the generic capabilities. Source- or venue-specific runtime branching is a last resort.

## Implemented model

`ingestion/venue-discovery/research-state.mjs` defines and validates independent `venue_likelihood`, `acquisition_readiness`, and `evidence_state` dimensions, evidence roles, limitations, programme references, technical state, persistent verification memory, and explicit resolution state. Discovery censuses now attach an initial research record and queue handoff without promoting discovery-provider claims to canonical facts.

`programme-fingerprint.mjs` performs bounded, deterministic classification of known public programme mechanisms. It records all observed signals, chooses a deterministic primary mechanism, and returns `negative_venue_evidence: false` even when access is blocked. Fingerprints route through reusable collector-capability categories; fingerprinting does not activate or execute collectors.

`research-routing.mjs` contains the provider-neutral escalation sequence and queue routing. `research-memory.mjs` provides deterministic serialization, periodic-reverification checks, and evidence-preserving updates.

These records supplement governed source investigations; they do not weaken `docs/SOURCE_INVESTIGATION_POLICY.md`, authorise collection, or replace the offline-proof and activation gates.

## Current architecture audit

Before this package, `main` already had city-agnostic discovery contracts, isolated provider adapters, deterministic normalization/reconciliation, reconciliation against canonical registries, retained provider evidence, explicit promotion gates, and a mature governed source-investigation contract with acquisition classes and reusable collector families. It did not have a reusable candidate-research record separating venue status from acquisition status, evidence-purpose vocabulary, limitation-safe classification, a complete generic fingerprint vocabulary, explicit research queue routing, or candidate-level persistent memory.

PR #14 contains valuable Berlin evidence and a bounded passive triage implementation, but its rich status/mechanism logic is embedded in a Berlin artifact builder. This package generalizes the state, fingerprint, routing, and memory concepts from `origin/main`; it neither copies Berlin data nor depends on PR #14.

## Autonomy readiness

### Ready now

- Multi-source discovery, deterministic reconciliation, initial research records, generic fingerprints, capability routing, durable queue items, deterministic serialization, and periodic-reverification metadata.
- Continuous processing can safely classify and queue candidates without activating them.

### Needs engineering before always-on use

- A durable shared queue/storage backend with leases, idempotency, retry policy, observability, and concurrency control.
- Governed network workers that retain evidence while advancing the source-investigation escalation ladder.
- Generic official-domain search, browser/XHR observation, social-platform connectors, and automatic comparison with the implemented collector inventory.
- Explicit authorisation boundaries before collector execution; discovery/research must never imply activation.

### Suitable for an AI-assisted worker

- Alias/rebrand resolution, social-first programmes, recognised event-platform corroboration, weak or conflicting identity signals, and proposed evidence summaries with citations.

### Should remain human-gated

- Canonical identity/room conflicts, disputed closure, rights/access questions, source activation, registry mutation, collector authorisation, publication, and production deployment.

For a large new-city run, the remaining blocker is operational rather than conceptual: implement the durable research queue and governed evidence-acquisition worker, then run a bounded automation trial before always-on collection.
