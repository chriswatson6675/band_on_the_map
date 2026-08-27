# Read-only remote research workflow

`Run BeatMapped Research Proof` is the manual, non-publishing counterpart to the production deployment workflow. It reuses the protected `beatmapped-collector-production` GitHub Environment and its existing host, user, SSH key, and pinned host-key secrets, but it does not call `deploy/install.sh`, switch `/opt/band-on-the-map`, invoke collection/publication commands, or mutate systemd state.

The workflow accepts a full lowercase 40-character `candidate_sha` and an enumerated `research_job`. Version 1 allows only `berlin-browser-proof`; no shell or command input exists. Candidate capability is checked before protected-environment access and again in the detached remote checkout.

The remote controller captures production HEAD, working-tree state, service/timer state, publication checksum/timestamp, and source/venue registry-tree checksum. Work occurs only below `/tmp/beatmapped-research/gh-<run-id>-<attempt>/`. A post-run comparison fails closed if protected production state differs.

The runtime audit records OS, architecture, Node, RAM, disk, load, Chromium path/version, missing shared libraries, and whether the SSH principal can write the production checkout. It never installs packages. Browser execution proceeds only for `BROWSER_RUNTIME_READY`, which requires at least 768 MiB currently available memory, 1 GiB temporary space, Node 20.9+, a Chromium runtime with no determinable missing libraries, and a non-writable production checkout. All other controlled classifications retain the audit and stop.

The Berlin job derives its complete corpus from the candidate's machine-readable browser ledger, requires retained Level 1/2 `INSUFFICIENT` history, uses PR #17's explicit system-Chromium Playwright adapter and safety defaults, and runs serially. Outputs are sanitized and credential-audited before the 14-day GitHub artifact is uploaded.

Cleanup uses a dedicated process session and an exact run-owned root. It never uses `pkill`/`killall`, never targets unrelated Chromium processes, and removes only the validated `/tmp/beatmapped-research/gh-…` directory.

This workflow must exist on the repository's default branch before GitHub permits `workflow_dispatch`. Opening this infrastructure PR does not itself expose or execute production SSH access; after review and merge, a Founder can dispatch the exact approved SHA and approve the protected Environment if its rules require approval.
