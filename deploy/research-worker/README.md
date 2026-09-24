# BeatMapped research worker

The first worker is a DigitalOcean Basic Droplet in the production region, sized for bounded browser concurrency 1: Ubuntu 24.04 x64, 2 GiB RAM, 1 vCPU, and 50 GiB disk. It is separate from the production host and never contains the production checkout or credentials.

Provision with a new Ed25519 key and a copy of `cloud-init.yml` whose public-key placeholder has been replaced outside Git. Bootstrap SSH is temporarily restricted to the operator's current `/32`. The proof runner is repository-scoped and ephemeral, connects outbound to GitHub, and carries the custom `beatmapped-research-worker` label. After proof and SSH verification, remove all inbound firewall rules.

The GitHub Environment is also named `beatmapped-research-worker`. It contains no production secrets. The manual workflow retains exact SHA validation, a fixed job allowlist, deterministic dependency installation, run-owned temporary checkout and cleanup, artifact sanitization, and a stable machine-marker guard.

Do not install the runner as a permanent service in this package. A later, explicitly authorized always-on design must define patching, runner lifecycle, queue ownership, observability, and human review before enabling persistent execution.
