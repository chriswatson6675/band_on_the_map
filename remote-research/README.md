# Dedicated read-only research worker

`Run BeatMapped Research Proof` is the manual, non-publishing research workflow. Its protected job targets only a repository-scoped runner carrying the labels `self-hosted`, `linux`, `x64`, and `beatmapped-research-worker`, under the separate `beatmapped-research-worker` GitHub Environment.

The worker has a stable `/etc/beatmapped-research-worker.json` identity marker, runs routinely as the non-root `botm-research` user, and must not contain `/opt/band-on-the-map`. It receives no production SSH, publication, or collector credentials. The initial proof uses an ephemeral outbound GitHub runner instead of exposing SSH to GitHub-hosted runners' dynamic address space.

The workflow accepts only a full lowercase 40-character `candidate_sha` and the enumerated `berlin-browser-proof` job. It records and checks the exact controller commit, verifies the candidate is reachable from a repository ref, checks out the candidate detached below `/tmp/beatmapped-research/gh-<run-id>-<attempt>/`, runs `npm ci --omit=dev --ignore-scripts`, and executes only the versioned browser controller.

Before candidate code runs, `worker-state.mjs` requires the exact worker marker, the `botm-research` identity, a run-owned mode-0700 temporary root, and absence of the protected production path. The same state is captured after the proof. The runtime audit requires Node 20.9+, at least 768 MiB available memory, at least 1 GiB temporary disk, an explicit system Chromium/Chrome executable, no determinable missing libraries, and a non-writable production path.

The Berlin corpus is mechanically derived from the candidate ledger and must contain retained Level 1 and Level 2 `INSUFFICIENT` probes before Level 3 browser observation. Browser probes run serially. Artifacts are sanitized, credential-audited, uploaded for 14 days, and then the exact run-owned process session and temporary root are removed.

The workflow never invokes deployment, collection, publication, activation, scheduler, or service-management commands. Production-host state is not queried or addressed by the research job.
