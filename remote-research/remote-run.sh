#!/usr/bin/env bash
set -Eeuo pipefail

CANDIDATE_SHA="${1:-}"
RESEARCH_JOB="${2:-}"
RUN_TOKEN="${3:-}"
PRODUCTION_PATH="/opt/band-on-the-map"
PUBLICATION_PATH="${PRODUCTION_PATH}/data/public"
REPOSITORY_URL="https://github.com/chriswatson6675/band_on_the_map.git"
RESEARCH_ROOT="/tmp/beatmapped-research/${RUN_TOKEN}"
CONTROLLER_ROOT="${RESEARCH_ROOT}/controller"
CHECKOUT_ROOT="${RESEARCH_ROOT}/candidate"
ARTIFACT_ROOT="${RESEARCH_ROOT}/artifacts"
BROWSER_TEMP="${RESEARCH_ROOT}/browser-tmp"
BROWSER_HOME="${RESEARCH_ROOT}/home"
FINALIZED=0

node "${CONTROLLER_ROOT}/validate-request.mjs" "${CANDIDATE_SHA}" "${RESEARCH_JOB}"
node "${CONTROLLER_ROOT}/validate-paths.mjs" "${PRODUCTION_PATH}" "${RESEARCH_ROOT}" "${PUBLICATION_PATH}"

mkdir -p -- "${ARTIFACT_ROOT}" "${BROWSER_TEMP}" "${BROWSER_HOME}"
chmod 700 -- "${RESEARCH_ROOT}" "${ARTIFACT_ROOT}" "${BROWSER_TEMP}" "${BROWSER_HOME}"

finalize() {
  local original_status=$?
  if [ "${FINALIZED}" -eq 1 ]; then return; fi
  FINALIZED=1
  trap - EXIT
  set +e
  node "${CONTROLLER_ROOT}/host-state.mjs" capture "${PRODUCTION_PATH}" "${ARTIFACT_ROOT}/production-after.json"
  node "${CONTROLLER_ROOT}/host-state.mjs" compare "${ARTIFACT_ROOT}/production-before.json" "${ARTIFACT_ROOT}/production-after.json" > "${ARTIFACT_ROOT}/production-isolation.json"
  local isolation_status=$?
  node "${CONTROLLER_ROOT}/sanitize-artifacts.mjs" "${ARTIFACT_ROOT}" > "${ARTIFACT_ROOT}/credential-audit.txt"
  local audit_status=$?
  if [ "${isolation_status}" -ne 0 ] || [ "${audit_status}" -ne 0 ]; then original_status=1; fi
  printf '{"exit_code":%s,"production_isolation":"%s","credential_audit":"%s"}\n' \
    "${original_status}" "$([ "${isolation_status}" -eq 0 ] && printf PASS || printf FAIL)" "$([ "${audit_status}" -eq 0 ] && printf PASS || printf FAIL)" \
    > "${ARTIFACT_ROOT}/run-outcome.json"
  exit "${original_status}"
}
trap finalize EXIT

node "${CONTROLLER_ROOT}/host-state.mjs" capture "${PRODUCTION_PATH}" "${ARTIFACT_ROOT}/production-before.json"
node "${CONTROLLER_ROOT}/runtime-audit.mjs" "${PRODUCTION_PATH}" > "${ARTIFACT_ROOT}/runtime-audit.json"
RUNTIME_CLASSIFICATION="$(node -e "const a=require(process.argv[1]);process.stdout.write(a.classification)" "${ARTIFACT_ROOT}/runtime-audit.json")"
printf '%s\n' "${RUNTIME_CLASSIFICATION}" > "${ARTIFACT_ROOT}/runtime-classification.txt"

if [ "${RUNTIME_CLASSIFICATION}" != "BROWSER_RUNTIME_READY" ]; then
  echo "Browser proof stopped cleanly: ${RUNTIME_CLASSIFICATION}"
  exit 20
fi

git clone --filter=blob:none --no-checkout "${REPOSITORY_URL}" "${CHECKOUT_ROOT}"
git -C "${CHECKOUT_ROOT}" fetch --no-tags origin "${CANDIDATE_SHA}"
git -C "${CHECKOUT_ROOT}" checkout --detach "${CANDIDATE_SHA}"
ACTUAL_SHA="$(git -C "${CHECKOUT_ROOT}" rev-parse HEAD)"
if [ "${ACTUAL_SHA}" != "${CANDIDATE_SHA}" ]; then
  echo "Detached checkout mismatch: ${ACTUAL_SHA}" >&2
  exit 1
fi
node "${CONTROLLER_ROOT}/validate-request.mjs" "${CANDIDATE_SHA}" "${RESEARCH_JOB}" "${CHECKOUT_ROOT}"

(
  cd "${CHECKOUT_ROOT}"
  npm ci --omit=dev --ignore-scripts
)

CHROMIUM_PATH="$(node -e "const a=require(process.argv[1]);process.stdout.write(a.chromium.executable_path)" "${ARTIFACT_ROOT}/runtime-audit.json")"
setsid env -i \
  PATH="${PATH}" \
  HOME="${BROWSER_HOME}" \
  TMPDIR="${BROWSER_TEMP}" \
  NODE_ENV=production \
  node "${CONTROLLER_ROOT}/run-berlin-browser-proof.mjs" \
    "--checkout=${CHECKOUT_ROOT}" \
    "--output=${ARTIFACT_ROOT}" \
    "--chromium=${CHROMIUM_PATH}" \
    "--candidate-sha=${CANDIDATE_SHA}" \
    > "${ARTIFACT_ROOT}/proof-summary.json" \
    2> "${ARTIFACT_ROOT}/proof-stderr.log" &
PROOF_PID=$!
printf '%s\n' "${PROOF_PID}" > "${RESEARCH_ROOT}/proof.pid"
wait "${PROOF_PID}"
