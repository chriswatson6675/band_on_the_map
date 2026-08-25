#!/usr/bin/env bash
# BOTM-COLLECTOR-DEPLOY-HARDENING-01
#
# Exactly one job: decide whether the working tree at $1 (the deployed
# application checkout) is safe to move to a new pinned commit via
# `git checkout --detach <ref>`, and if the ONLY reason it isn't is the
# known, deterministic, collector-regenerated runtime publication artifact
# (GENERATED_ARTIFACT_PATH below), discard exactly that one file's local
# modification -- and nothing else -- so the checkout can proceed cleanly.
#
# WHY this file exists (see deploy/README.md "Runtime artifact vs pinned
# deployment"): ingestion/unattended-runner/run.mjs's normal, twice-daily,
# already-proven collection cycle rewrites this ONE tracked file in place
# on every run (deliberately -- see docs/UNATTENDED_RUNNER.md). That is
# expected, healthy production behaviour, not an operator mistake. But it
# means the deployed checkout is routinely "dirty" by the time a human
# runs install.sh again for a new pinned-SHA deployment, and a bare `git
# checkout --detach` correctly refuses to silently overwrite it. Before
# this package, an operator had to work around that by hand with an
# ad-hoc `git stash`. This script makes that ONE specific, safe case a
# first-class, explicit, logged, auditable part of the deployment flow --
# and still refuses (changes nothing, exits non-zero) for every other
# kind of dirty working tree, staged change, or unexpected file, exactly
# as a bare `git checkout --detach` already did before this package.
#
# This script NEVER runs `git stash` -- it either finds the tree already
# clean, or discards (git checkout -- <path>) exactly the one named,
# deterministic, regenerable file, or refuses outright. No stash is ever
# created by this script, so no stash can ever accumulate from it.
#
# Usage: deploy/check-deploy-tree.sh <app-dir>
# Exit 0: tree is safe to check out (clean, or the ONE known artifact was
#         just discarded -- see stdout for which). Nothing else is ever
#         touched.
# Exit 1: tree is NOT safe to check out -- nothing was changed. See
#         stderr for exactly which file(s) stopped deployment.

set -euo pipefail

# The one file this script is ever allowed to touch. Named, explicit,
# auditable -- see deploy/README.md's "Runtime artifact vs pinned
# deployment" section. Never broadened to a glob/pattern/directory.
GENERATED_ARTIFACT_PATH="data/public/lisbon-porto-map.json"

APP_DIR="${1:-}"
if [ -z "$APP_DIR" ]; then
  echo "Usage: check-deploy-tree.sh <app-dir>" >&2
  exit 1
fi

STATUS="$(git -C "$APP_DIR" status --porcelain=v1)"

if [ -z "$STATUS" ]; then
  echo "Working tree is clean -- nothing to reconcile before checkout."
  exit 0
fi

# git status --porcelain=v1 format is exactly "XY PATH" (X = index/staged
# state, Y = worktree state, then a single space, then the path).
OTHER_CHANGES=0
ARTIFACT_UNSTAGED_MODIFIED=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  xy="${line:0:2}"
  path="${line:3}"

  if [ "$xy" = " M" ] && [ "$path" = "$GENERATED_ARTIFACT_PATH" ]; then
    ARTIFACT_UNSTAGED_MODIFIED=1
    continue
  fi

  # Anything else at all -- a different modified/added/deleted/renamed
  # tracked file, ANY staged change (index column not space or '?'), any
  # untracked file, any merge conflict marker, or even a non-" M" status
  # on the generated artifact itself (e.g. staged, deleted, renamed) --
  # is unexpected and must stop deployment. Nothing is discarded here.
  OTHER_CHANGES=1
  echo "UNEXPECTED working-tree change (deployment refused): $line" >&2
done <<< "$STATUS"

if [ "$OTHER_CHANGES" -eq 1 ]; then
  echo "ERROR: working tree has unexpected modifications beyond the known" >&2
  echo "generated runtime artifact ($GENERATED_ARTIFACT_PATH). Refusing to" >&2
  echo "deploy -- nothing was changed. Investigate the file(s) listed" >&2
  echo "above manually; this script never discards anything but the one" >&2
  echo "known, deterministic, collector-regenerated publication artifact." >&2
  exit 1
fi

if [ "$ARTIFACT_UNSTAGED_MODIFIED" -eq 1 ]; then
  echo "Detected the expected runtime-generated publication artifact"
  echo "($GENERATED_ARTIFACT_PATH) locally modified -- this is normal,"
  echo "deterministic output from the unattended collector, not an"
  echo "operator change. Discarding this ONE file's local modification"
  echo "intentionally (it will be regenerated fresh by the next"
  echo "unattended/publication run) so the pinned-SHA checkout can proceed."
  git -C "$APP_DIR" checkout -- "$GENERATED_ARTIFACT_PATH"
  echo "Discarded local modification to $GENERATED_ARTIFACT_PATH."
fi

exit 0
