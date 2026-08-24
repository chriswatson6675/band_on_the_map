// VENUE-MANUAL-COORDINATES-DASHBOARD-01 — the single fail-closed gate
// deciding whether the operator dashboard's write endpoint may actually
// persist a manual coordinate. Kept as its own tiny, dependency-free,
// directly-testable module (rather than inline in the API route) so a
// production/Vercel write-safety test never has to boot a Next.js request
// handler to exercise it.
//
// Rules (all fail closed — an unrecognised/unexpected environment shape
// never defaults to "allowed"):
//   - Vercel's own platform env var (`VERCEL`) is set             -> NEVER writable,
//     no override exists for this — a real Vercel deployment must never
//     accept a manual-coordinate write, full stop.
//   - NODE_ENV === "production" (e.g. a local `next build && next start`)
//     -> writable ONLY with the explicit opt-in `BOTM_OPERATOR_MODE=1`.
//   - otherwise (ordinary local `next dev`)                        -> writable.
//
// This is an explicit environment-based gate, not reliance on the
// `/operator/venues` route path being obscure — the route existing and
// being reachable is not, by itself, what makes a write safe.

export function operatorWritesAllowed(env = process.env) {
  if (env?.VERCEL) return false;
  if (env?.NODE_ENV === "production") return env?.BOTM_OPERATOR_MODE === "1";
  return true;
}

export function operatorWriteDeniedReason(env = process.env) {
  if (env?.VERCEL) return "VERCEL_PRODUCTION_WRITES_DISABLED";
  if (env?.NODE_ENV === "production" && env?.BOTM_OPERATOR_MODE !== "1") return "PRODUCTION_WRITES_REQUIRE_BOTM_OPERATOR_MODE";
  return null;
}
