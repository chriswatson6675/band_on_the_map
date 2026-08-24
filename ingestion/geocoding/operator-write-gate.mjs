// VENUE-MANUAL-COORDINATES-DASHBOARD-01/01B — the single fail-closed gate
// deciding whether the operator dashboard's write endpoint may actually
// persist a manual coordinate. Kept as its own tiny, dependency-free,
// directly-testable module (rather than inline in the API route) so a
// hosted-deployment write-safety test never has to boot a Next.js request
// handler to exercise it.
//
// Rules (all fail closed — an unrecognised/unexpected environment shape
// never defaults to "allowed"):
//   - a known HOSTED deployment platform's own env var is set
//     (`VERCEL`, or `NETLIFY` — this repo's real deployment surface, see
//     netlify.toml)                                              -> NEVER
//     writable, no override exists for either — a hosted deployment's
//     filesystem is ephemeral and is never the canonical
//     venues/manual-coordinates.json in the real Git-tracked working
//     repository, so it must never report a successful write, full stop.
//     `BOTM_OPERATOR_MODE` cannot override this for either platform.
//   - NODE_ENV === "production" on a NON-hosted process (e.g. a locally
//     run `next build && next start`, with neither VERCEL nor NETLIFY set)
//     -> writable ONLY with the explicit opt-in `BOTM_OPERATOR_MODE=1`.
//   - otherwise (ordinary local `next dev`)                        -> writable.
//
// This is an explicit environment-based gate, not reliance on the
// `/operator/venues` route path being obscure — the route existing and
// being reachable is not, by itself, what makes a write safe.

const HOSTED_DEPLOYMENT_ENV_VARS = [
  { key: "VERCEL", reason: "VERCEL_HOSTED_WRITES_DISABLED" },
  { key: "NETLIFY", reason: "NETLIFY_HOSTED_WRITES_DISABLED" },
];

function hostedDeploymentDeniedReason(env) {
  for (const { key, reason } of HOSTED_DEPLOYMENT_ENV_VARS) {
    if (env?.[key]) return reason;
  }
  return null;
}

export function operatorWritesAllowed(env = process.env) {
  if (hostedDeploymentDeniedReason(env)) return false;
  if (env?.NODE_ENV === "production") return env?.BOTM_OPERATOR_MODE === "1";
  return true;
}

export function operatorWriteDeniedReason(env = process.env) {
  const hostedReason = hostedDeploymentDeniedReason(env);
  if (hostedReason) return hostedReason;
  if (env?.NODE_ENV === "production" && env?.BOTM_OPERATOR_MODE !== "1") return "PRODUCTION_WRITES_REQUIRE_BOTM_OPERATOR_MODE";
  return null;
}
