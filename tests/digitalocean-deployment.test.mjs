// BOTM-DIGITALOCEAN-UNATTENDED-DEPLOYMENT-01 — offline, content-level
// proof for the repo-side deployment assets. These are plain-text systemd
// unit files and a shell script, not executable Node modules, so this
// suite parses their text content directly rather than importing them —
// still a genuine, mechanical check against silent drift (a future edit
// accidentally removing the pinned-ref requirement, hardcoding a host,
// embedding a credential, or duplicating BOTM's own retry/lock logic at
// the systemd level).

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

async function readDeployFile(name) {
  return readFile(new URL(`../deploy/${name}`, import.meta.url), "utf8");
}

// --- systemd service unit ---

test("service unit: ExecStart runs exactly `npm run unattended`, the canonical command", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^ExecStart=.*npm run unattended\s*$/m);
});

test("service unit: Type=oneshot (one bounded cycle, not a long-running daemon)", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^Type=oneshot\s*$/m);
});

test("service unit: runs as a dedicated non-root service user, never root", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^User=botm\s*$/m);
  assert.doesNotMatch(unit, /^User=root\s*$/m);
});

test("service unit: WorkingDirectory is set to the documented application path", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^WorkingDirectory=\/opt\/band-on-the-map\s*$/m);
});

test("service unit: does not duplicate BOTM's own retry logic — Restart=no", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^Restart=no\s*$/m);
});

test("service unit: treats BOTM's own exit codes honestly — 0 (HEALTHY/DEGRADED) and 2 (overlap-refused) are both non-failure; FAILED (1) is not listed as success", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  const match = /^SuccessExitStatus=(.+)$/m.exec(unit);
  assert.ok(match, "expected an explicit SuccessExitStatus= line");
  const codes = match[1].trim().split(/\s+/).map(Number);
  assert.deepEqual(codes.sort(), [0, 2]);
  assert.ok(!codes.includes(1), "exit 1 (FAILED) must never be treated as a systemd success");
});

test("service unit: logs go to the journal (journalctl-readable), never a raw file", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^StandardOutput=journal\s*$/m);
  assert.match(unit, /^StandardError=journal\s*$/m);
});

test("service unit: has a bounded start timeout, not unbounded", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^TimeoutStartSec=\S+/m);
});

// --- systemd timer unit ---

test("timer unit: schedules approximately twice daily, ~06:15 and ~18:15 UTC", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.timer");
  const calendars = [...unit.matchAll(/^OnCalendar=(.+)$/gm)].map((m) => m[1].trim());
  assert.equal(calendars.length, 2, "expected exactly two OnCalendar= entries (twice daily)");
  assert.ok(calendars.some((c) => c.includes("06:15")), `expected a ~06:15 UTC entry, got: ${calendars}`);
  assert.ok(calendars.some((c) => c.includes("18:15")), `expected a ~18:15 UTC entry, got: ${calendars}`);
  assert.ok(calendars.every((c) => /UTC/.test(c)), "every OnCalendar= entry must be explicit UTC");
});

test("timer unit: Persistent=true — a missed run fires after recovery", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.timer");
  assert.match(unit, /^Persistent=true\s*$/m);
});

test("timer unit: installs under timers.target (the standard systemd convention)", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.timer");
  assert.match(unit, /^WantedBy=timers\.target\s*$/m);
});

// --- install.sh ---

test("install.sh: refuses to run without an explicit --ref (never a silent, moving branch pull)", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /ERROR: --ref=<git-sha-or-tag> is required/);
  // Strip comment lines first — the script's own doc comment explains, in
  // prose, that it never does a blind `git pull`; that explanatory mention
  // is fine and expected. What must never exist is an actually-EXECUTED
  // `git pull` command.
  const executableLines = script
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(executableLines, /git pull/, "the update strategy must never execute a blind git pull");
});

test("install.sh: pins the checkout with a detached, explicit ref, not a branch tracking checkout", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /git .*checkout --detach "?\$REF"?/);
});

test("install.sh: creates a dedicated non-login system user, never runs the app as root", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /useradd --system --no-create-home --shell \/usr\/sbin\/nologin/);
});

test("install.sh: installs dependencies deterministically (npm ci), production-only", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /npm ci --omit=dev/);
});

test("install.sh: requires root/sudo before mutating system state", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /id -u.*-ne 0/);
});

test("install.sh: does NOT enable or start the unattended timer/service itself — that is a separate, deliberate manual step", async () => {
  const script = await readDeployFile("install.sh");
  // The script prints instructions (inside a `cat <<EOF ... EOF` heredoc)
  // that MENTION the enable command as the operator's next manual step —
  // that mention is fine. What must never exist is an actually-executed
  // `systemctl enable ... botm-unattended...` line, i.e. one appearing in
  // the script BEFORE the heredoc marker that only prints text.
  //
  // BEATMAPPED-PUBLICATION-SERVICE-DEPLOY-LIFECYCLE-01: this is
  // deliberately scoped to botm-unattended specifically now, not to
  // "systemctl enable" as a whole — install.sh now DOES enable
  // botm-publication.service unconditionally (a distinct, long-running
  // unit; see the dedicated tests below for why that divergence is
  // intentional and safe), while continuing to leave
  // botm-unattended.service/.timer exactly as before: installed/reloaded,
  // never enabled/started by this script.
  const heredocStart = script.indexOf("cat <<EOF");
  assert.ok(heredocStart > -1, "expected the script to print next-step instructions via a heredoc");
  const executableBody = script.slice(0, heredocStart);
  assert.doesNotMatch(
    executableBody,
    /systemctl enable[^\n]*botm-unattended/,
    "install.sh must never itself enable the unattended timer/service — only print it as the operator's next manual step",
  );
  assert.doesNotMatch(
    executableBody,
    /systemctl (start|restart)[^\n]*botm-unattended\.timer/,
    "install.sh must never itself start/restart the unattended timer",
  );
  assert.match(script, /NOT enabled\/started/);
});

// --- BEATMAPPED-PUBLICATION-SERVICE-DEPLOY-LIFECYCLE-01: publication service restart ---

test("install.sh: installs the repo-controlled botm-publication.service unit alongside the other two", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(
    script,
    /install -m 0644 "\$APP_DIR\/deploy\/systemd\/botm-publication\.service" \/etc\/systemd\/system\/botm-publication\.service/,
  );
});

test("install.sh: installs all three unit files, then daemon-reloads, before restarting anything", async () => {
  const script = await readDeployFile("install.sh");
  // Use the EXECUTED lines only — the script's own header doc-comment
  // (lines ~41-42) mentions "systemd unit files ... systemctl daemon-reload"
  // in prose describing what the script does, which would otherwise be
  // found first by a naive indexOf and make this ordering check meaningless.
  const executableLines = script
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const unattendedServiceIdx = executableLines.indexOf('install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.service"');
  const unattendedTimerIdx = executableLines.indexOf('install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.timer"');
  const publicationIdx = executableLines.indexOf('install -m 0644 "$APP_DIR/deploy/systemd/botm-publication.service"');
  const daemonReloadIdx = executableLines.indexOf("systemctl daemon-reload");
  const restartIdx = executableLines.indexOf("systemctl restart botm-publication.service");

  for (const idx of [unattendedServiceIdx, unattendedTimerIdx, publicationIdx, daemonReloadIdx, restartIdx]) {
    assert.ok(idx > -1, "expected to find every install/reload/restart step in install.sh");
  }
  assert.ok(unattendedServiceIdx < daemonReloadIdx, "unit install must precede daemon-reload");
  assert.ok(unattendedTimerIdx < daemonReloadIdx, "unit install must precede daemon-reload");
  assert.ok(publicationIdx < daemonReloadIdx, "publication unit install must precede daemon-reload");
  assert.ok(daemonReloadIdx < restartIdx, "daemon-reload must happen before the publication service is restarted");
});

test("install.sh: by DEFAULT (no --skip-publication-restart), restarts botm-publication.service (systemctl restart, not merely start) after code/deps are in place — unchanged from prior behaviour", async () => {
  const script = await readDeployFile("install.sh");
  const npmCiIdx = script.indexOf("npm ci --omit=dev");
  const chownIdx = script.indexOf("chown -R");
  const restartIdx = script.indexOf("systemctl restart botm-publication.service");
  assert.ok(restartIdx > -1, "expected a `systemctl restart botm-publication.service` reachable in the default (no-flag) path");
  assert.ok(restartIdx > npmCiIdx, "the publication service must be restarted AFTER new dependencies are installed");
  assert.ok(restartIdx > chownIdx, "the publication service must be restarted AFTER ownership is fixed to the botm user");
  // `restart` (not `start`) is required: `start` would silently do nothing
  // if the service was already running old code, defeating the entire
  // point of this fix (Node.js never hot-reloads ES modules).
  assert.doesNotMatch(script, /systemctl start botm-publication\.service/);
  // BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01: the restart is now
  // reachable through an if/else on an explicit flag, not literally
  // unconditional line-for-line — but the restart must sit in the `else`
  // (flag-absent, default) branch, i.e. still gated on SKIP_PUBLICATION_RESTART
  // being false, never behind any other condition.
  const elseIdx = script.lastIndexOf("else", restartIdx);
  assert.ok(elseIdx > -1 && elseIdx < restartIdx, "the restart must live in the SKIP_PUBLICATION_RESTART else-branch");
});

// --- BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01: --skip-publication-restart ---

test("install.sh: accepts an explicit --skip-publication-restart flag that skips the enable/restart/health-check entirely", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /--skip-publication-restart\) SKIP_PUBLICATION_RESTART=1/);
  assert.match(script, /if \[ "\$SKIP_PUBLICATION_RESTART" -eq 1 \]; then/);
  assert.match(script, /Skipping botm-publication\.service enable\/restart/);
  // When skipped, neither `systemctl enable` nor `systemctl restart` for
  // the publication service may run — confirm the enable/restart calls
  // only appear after the `else`, never before it or outside any branch.
  const ifIdx = script.indexOf('if [ "$SKIP_PUBLICATION_RESTART" -eq 1 ]; then');
  const elseIdx = script.indexOf("else", ifIdx);
  const enableIdx = script.indexOf("systemctl enable botm-publication.service", ifIdx);
  const restartIdx = script.indexOf("systemctl restart botm-publication.service", ifIdx);
  assert.ok(elseIdx > ifIdx && enableIdx > elseIdx && restartIdx > elseIdx, "enable/restart must only be reachable in the else (flag-absent) branch");
});

test("install.sh: --skip-publication-restart is driven purely by the explicit flag, never inferred from --ref or a branch/tag name", async () => {
  const script = await readDeployFile("install.sh");
  // The SKIP_PUBLICATION_RESTART decision must never reference $REF or
  // any branch-name pattern (e.g. "candidate/deploy") -- only the
  // literal --skip-publication-restart argument sets it.
  const decisionRegion = script.slice(script.indexOf('for arg in "$@"'), script.indexOf('if [ -z "$REF" ]'));
  assert.doesNotMatch(decisionRegion, /candidate\/deploy/, "must never infer trial behaviour from a candidate branch naming convention");
  assert.doesNotMatch(decisionRegion, /SKIP_PUBLICATION_RESTART=1.*REF/, "must never derive the skip decision from $REF");
});

test("install.sh: arg-parsing loop, executed for real in bash, sets SKIP_PUBLICATION_RESTART=1 only when the exact flag is passed, and 0 by default", async () => {
  // A genuine behavioural proof (not merely text matching) of the exact
  // arg-parsing region of install.sh -- extracted byte-for-byte and run as
  // real bash, same convention as tests/deploy-github-workflow.test.mjs's
  // embedded-script extraction.
  const script = await readDeployFile("install.sh");
  const startMarker = 'APP_DIR="/opt/band-on-the-map"';
  const endMarker = 'if [ -z "$REF" ]; then';
  const startIdx = script.indexOf(startMarker);
  const endIdx = script.indexOf(endMarker);
  assert.ok(startIdx > -1 && endIdx > startIdx, "expected to locate the variable-defaults-through-arg-parsing region");
  const region = script.slice(startIdx, endIdx);

  const dir = await mkdtemp(join(tmpdir(), "botm-install-argparse-"));
  try {
    const harnessPath = join(dir, "harness.sh");
    await writeFile(
      harnessPath,
      `#!/usr/bin/env bash\nset -euo pipefail\n${region}\necho "REF=$REF"\necho "SKIP_PUBLICATION_RESTART=$SKIP_PUBLICATION_RESTART"\n`,
    );

    const defaultRun = await execFileAsync("bash", [harnessPath, "--ref=abc123"]);
    assert.match(defaultRun.stdout, /REF=abc123/);
    assert.match(defaultRun.stdout, /SKIP_PUBLICATION_RESTART=0/, "the flag must default to 0 (off) when not passed");

    const flaggedRun = await execFileAsync("bash", [harnessPath, "--ref=abc123", "--skip-publication-restart"]);
    assert.match(flaggedRun.stdout, /REF=abc123/);
    assert.match(flaggedRun.stdout, /SKIP_PUBLICATION_RESTART=1/, "the flag must be 1 (on) when explicitly passed");

    // Order-independence: the flag is never positionally coupled to --ref.
    const reorderedRun = await execFileAsync("bash", [harnessPath, "--skip-publication-restart", "--ref=abc123"]);
    assert.match(reorderedRun.stdout, /SKIP_PUBLICATION_RESTART=1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("install.sh: every other install step (fetch/checkout/npm-ci/systemd-unit-install/ownership) still runs regardless of --skip-publication-restart — only the publication restart itself is skipped", async () => {
  const script = await readDeployFile("install.sh");
  const ifIdx = script.indexOf('if [ "$SKIP_PUBLICATION_RESTART" -eq 1 ]; then');
  const preConditionalScript = script.slice(0, ifIdx);
  // npm ci, systemd unit installs, and chown must all appear BEFORE the
  // SKIP_PUBLICATION_RESTART branch — i.e. unconditionally, regardless of
  // the flag.
  assert.match(preConditionalScript, /npm ci --omit=dev/);
  assert.match(preConditionalScript, /install -m 0644 "\$APP_DIR\/deploy\/systemd\/botm-unattended\.service"/);
  assert.match(preConditionalScript, /install -m 0644 "\$APP_DIR\/deploy\/systemd\/botm-publication\.service"/);
  assert.match(preConditionalScript, /chown -R "\$SERVICE_USER:\$SERVICE_USER"/);
});

test("install.sh: enables botm-publication.service so it survives a reboot, unlike the unattended timer's deliberate manual gate", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /systemctl enable botm-publication\.service/);
});

test("install.sh: verifies the publication service actually came back active, and fails the deployment loudly if it did not", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /systemctl is-active --quiet botm-publication\.service/);
  // The check must be a real gate that can abort the script — i.e. an
  // `exit 1` reachable from a failed check — never merely logged/ignored.
  const checkIdx = script.indexOf("systemctl is-active --quiet botm-publication.service");
  const nextExit1Idx = script.indexOf("exit 1", checkIdx);
  assert.ok(nextExit1Idx > -1 && nextExit1Idx - checkIdx < 1000, "expected a nearby `exit 1` gating on the active-check result");
  // Must not be swallowed by an `|| true`-style suppression.
  assert.doesNotMatch(script, /systemctl is-active --quiet botm-publication\.service\s*\|\|\s*true/);
});

test("install.sh: does not add a second publication service or a new timer/scheduler", async () => {
  const script = await readDeployFile("install.sh");
  assert.doesNotMatch(script, /botm-publication-2|botm-publication-v2|new.{0,20}timer/i);
  const publicationMentions = (script.match(/botm-publication\.service/g) ?? []).length;
  assert.ok(publicationMentions >= 3, "expected botm-publication.service referenced by install, restart, and verify steps only");
});

test("install.sh: no Berlin-specific deployment behaviour is introduced", async () => {
  const script = await readDeployFile("install.sh");
  assert.doesNotMatch(script, /berlin/i);
});

test("install.sh: explicit --ref SHA-pinning behaviour is unchanged by the publication-service fix", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /ERROR: --ref=<git-sha-or-tag> is required/);
  assert.match(script, /git .*checkout --detach "?\$REF"?/);
});

// --- no embedded credentials/hosts anywhere in the deployment assets ---

const CREDENTIAL_LIKE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id shape
  /\bpassword\s*=\s*["'][^"']+["']/i,
  /\bsecret\s*=\s*["'][^"']+["']/i,
  /\btoken\s*=\s*["'][^"']+["']/i,
  /ssh-(rsa|ed25519|dss)\s+AAAA/, // an embedded public key is still not appropriate here
];

test("no deployment asset embeds any credential-shaped string", async () => {
  for (const name of ["systemd/botm-unattended.service", "systemd/botm-unattended.timer", "install.sh", "README.md"]) {
    const content = await readDeployFile(name);
    for (const pattern of CREDENTIAL_LIKE_PATTERNS) {
      assert.doesNotMatch(content, pattern, `${name} appears to embed credential-shaped content matching ${pattern}`);
    }
  }
});

test("no deployment asset hardcodes a specific server IP address as the deploy target", async () => {
  const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
  for (const name of ["systemd/botm-unattended.service", "systemd/botm-unattended.timer", "install.sh"]) {
    const content = await readDeployFile(name);
    assert.doesNotMatch(content, ipPattern, `${name} must never hardcode a literal IP address as the deployment target`);
  }
});

test("install.sh's default repo URL is the real, public BOTM GitHub repository (no embedded token/credential in the URL)", async () => {
  const script = await readDeployFile("install.sh");
  const match = /REPO_URL="([^"]+)"/.exec(script);
  assert.ok(match, "expected a default REPO_URL");
  assert.equal(match[1], "https://github.com/chriswatson6675/band_on_the_map.git");
  assert.doesNotMatch(match[1], /@/, "a repo URL containing '@' may embed inline credentials — must never be present");
});

// --- documents the critical publication-bridge finding, not just the happy path ---

test("deploy/README.md honestly documents the Netlify (not Vercel) static-import publication gap", async () => {
  const readme = await readDeployFile("README.md");
  assert.match(readme, /Netlify/);
  assert.match(readme, /statically\s+imports?/i);
  assert.match(readme, /NO\s+effect on the live public site/i);
});

// ---------------------------------------------------------------------------
// BEATMAPPED-MAINLINE-CITY-WORKER-SYSTEMD-OWNERSHIP-01
//
// Before this package the ONLY copy of beatmapped-city-worker.service on the
// production host was one the bounded trial Action installed for run
// 33272969771 — the unit existed by accident of a historical experiment, not
// because the sanctioned deployment path owned it. A clean or rebuilt host
// would have had the worker's code and its unit asset on disk with nothing
// registered in systemd.
//
// install.sh now reconciles that unit like the other three managed units —
// and, just as deliberately, never starts or enables it. Deployment makes the
// worker AVAILABLE to systemd; it never authorises it to process city jobs.
// ---------------------------------------------------------------------------

const CITY_WORKER_UNIT_INSTALL = 'install -m 0644 "$APP_DIR/deploy/systemd/beatmapped-city-worker.service" /etc/systemd/system/beatmapped-city-worker.service';

/** The executed (non-comment) lines only — prose in the header must never satisfy a check. */
function executableLines(script) {
  return script
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/**
 * Runs install.sh's real systemd-unit-installation region as bash, with
 * `install` and `systemctl` overridden as shell FUNCTIONS (portable — immune
 * to this platform's PATH-resolution quirks) so the hardcoded
 * /etc/systemd/system destinations land inside a temp root instead.
 */
async function runUnitInstallRegion(script, { fakeRoot, appDir }) {
  const startMarker = 'echo "Installing systemd unit files..."';
  const endMarker = "systemctl daemon-reload";
  const startIdx = script.indexOf(startMarker);
  const endIdx = script.indexOf(endMarker, startIdx);
  assert.ok(startIdx > -1 && endIdx > startIdx, "expected to locate the systemd-unit install region");
  const region = script.slice(startIdx, endIdx + endMarker.length);

  const harness = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `APP_DIR=${JSON.stringify(appDir)}`,
    `FAKE_ROOT=${JSON.stringify(fakeRoot)}`,
    // Emulate `install -m <mode> <src> <dest>` into the sandbox root.
    "install() {",
    '  local mode="" src="" dest="" a',
    '  while [ "$#" -gt 0 ]; do',
    '    case "$1" in',
    '      -m) mode="$2"; shift 2 ;;',
    '      *) if [ -z "$src" ]; then src="$1"; else dest="$1"; fi; shift ;;',
    "    esac",
    "  done",
    '  local target="${FAKE_ROOT}${dest}"',
    '  mkdir -p "$(dirname "$target")"',
    '  cp "$src" "$target"',
    '  echo "INSTALLED mode=${mode} ${src} -> ${dest}"',
    "}",
    'systemctl() { echo "SYSTEMCTL $*"; }',
    region,
  ].join("\n");

  const dir = await mkdtemp(join(tmpdir(), "botm-unit-install-"));
  try {
    const harnessPath = join(dir, "harness.sh");
    await writeFile(harnessPath, harness);
    return await execFileAsync("bash", [harnessPath]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A synthetic APP_DIR carrying the four managed unit assets. */
async function syntheticAppDir(contents = "REPO UNIT CONTENT\n") {
  const appDir = await mkdtemp(join(tmpdir(), "botm-appdir-"));
  await mkdir(join(appDir, "deploy/systemd"), { recursive: true });
  for (const unit of ["botm-unattended.service", "botm-unattended.timer", "botm-publication.service"]) {
    await writeFile(join(appDir, "deploy/systemd", unit), `${unit} content\n`);
  }
  await writeFile(join(appDir, "deploy/systemd/beatmapped-city-worker.service"), contents);
  return appDir;
}

// --- §18: static safety — the unit is managed, and never executed ---

test("install.sh: beatmapped-city-worker.service is in the sanctioned unit installation list", async () => {
  const script = await readDeployFile("install.sh");
  assert.ok(
    executableLines(script).includes(CITY_WORKER_UNIT_INSTALL),
    "the normal installer must own this unit — not a trial-only step",
  );
});

test("install.sh: NEVER starts, restarts, enables, or `enable --now`s the city worker", async () => {
  const script = await readDeployFile("install.sh");
  // Executed body only: the trailing `cat <<EOF` heredoc PRINTS a summary
  // that legitimately names the unit, exactly as the existing
  // botm-unattended test above excludes its printed next-step instructions.
  const code = executableLines(script.slice(0, script.indexOf("cat <<EOF")));
  for (const forbidden of [
    /systemctl\s+start\s+beatmapped-city-worker/,
    /systemctl\s+restart\s+beatmapped-city-worker/,
    /systemctl\s+enable\s+beatmapped-city-worker/,
    /systemctl\s+enable\s+--now\s+beatmapped-city-worker/,
  ]) {
    assert.doesNotMatch(code, forbidden, "deployment must make the worker available, never authorise it to run");
  }
  // Nothing at all beyond `install` may reference the unit in an executed line.
  const referencing = code.split("\n").filter((l) => l.includes("beatmapped-city-worker"));
  assert.equal(referencing.length, 1, `exactly one executed line may mention the unit, got:\n${referencing.join("\n")}`);
  assert.ok(referencing[0].trim().startsWith("install -m 0644"), "that line must be the install itself");
});

test("install.sh: the city-worker unit install precedes daemon-reload, like the other three managed units", async () => {
  const code = executableLines(await readDeployFile("install.sh"));
  const cityIdx = code.indexOf(CITY_WORKER_UNIT_INSTALL);
  const reloadIdx = code.indexOf("systemctl daemon-reload");
  assert.ok(cityIdx > -1 && reloadIdx > cityIdx, "systemd must be reloaded after the unit is written");
});

// --- §14: clean host — nothing pre-existing ---

test("install.sh (real bash): on a CLEAN host the city-worker unit is installed from the repo asset, reloaded, and neither started nor enabled", async (t) => {
  const script = await readDeployFile("install.sh");
  const appDir = await syntheticAppDir("CLEAN HOST REPO UNIT\n");
  const fakeRoot = await mkdtemp(join(tmpdir(), "botm-fakeroot-"));
  t.after(() => Promise.all([rm(appDir, { recursive: true, force: true }), rm(fakeRoot, { recursive: true, force: true })]));

  const dest = join(fakeRoot, "etc/systemd/system/beatmapped-city-worker.service");
  assert.equal(existsSync(dest), false, "precondition: the clean host has no unit registered");

  const run = await runUnitInstallRegion(script, { fakeRoot, appDir });

  assert.equal(existsSync(dest), true, "a clean host must end up with the unit registered");
  assert.equal(await readFile(dest, "utf8"), "CLEAN HOST REPO UNIT\n", "installed from the deployed repo asset");
  assert.match(run.stdout, /INSTALLED mode=0644 .*beatmapped-city-worker\.service -> \/etc\/systemd\/system\/beatmapped-city-worker\.service/);
  assert.match(run.stdout, /SYSTEMCTL daemon-reload/);
  // All four managed units land.
  for (const unit of ["botm-unattended.service", "botm-unattended.timer", "botm-publication.service", "beatmapped-city-worker.service"]) {
    assert.equal(existsSync(join(fakeRoot, "etc/systemd/system", unit)), true, `${unit} must be reconciled`);
  }
  // And nothing was started or enabled by this region.
  assert.doesNotMatch(run.stdout, /SYSTEMCTL (start|restart|enable)/);
});

// --- §15: an existing trial artefact reconciles idempotently ---

test("install.sh (real bash): a STALE pre-existing unit (the trial artefact) is reconciled to the reviewed asset without error, start, or enable", async (t) => {
  const script = await readDeployFile("install.sh");
  const appDir = await syntheticAppDir("REVIEWED MAINLINE UNIT\n");
  const fakeRoot = await mkdtemp(join(tmpdir(), "botm-fakeroot-"));
  t.after(() => Promise.all([rm(appDir, { recursive: true, force: true }), rm(fakeRoot, { recursive: true, force: true })]));

  // Model production today: a unit left behind by bounded trial run 33272969771.
  const dest = join(fakeRoot, "etc/systemd/system/beatmapped-city-worker.service");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, "STALE TRIAL-INSTALLED UNIT\n");

  const run = await runUnitInstallRegion(script, { fakeRoot, appDir });

  assert.equal(
    await readFile(dest, "utf8"),
    "REVIEWED MAINLINE UNIT\n",
    "a stale trial copy must converge on the reviewed repo unit — its presence is never an error, and its content is never trusted",
  );
  assert.match(run.stdout, /SYSTEMCTL daemon-reload/);
  assert.doesNotMatch(run.stdout, /SYSTEMCTL (start|restart|enable)/, "an existing unit must never be started merely because it already existed");
});

test("install.sh (real bash): a clean host and a stale-artefact host converge on byte-identical registered units", async (t) => {
  const script = await readDeployFile("install.sh");
  const appDir = await syntheticAppDir("CONVERGENT UNIT CONTENT\n");
  const cleanRoot = await mkdtemp(join(tmpdir(), "botm-clean-"));
  const staleRoot = await mkdtemp(join(tmpdir(), "botm-stale-"));
  t.after(() => Promise.all([
    rm(appDir, { recursive: true, force: true }),
    rm(cleanRoot, { recursive: true, force: true }),
    rm(staleRoot, { recursive: true, force: true }),
  ]));

  const stalePath = join(staleRoot, "etc/systemd/system/beatmapped-city-worker.service");
  await mkdir(dirname(stalePath), { recursive: true });
  await writeFile(stalePath, "ANCIENT TRIAL UNIT\n");

  await runUnitInstallRegion(script, { fakeRoot: cleanRoot, appDir });
  await runUnitInstallRegion(script, { fakeRoot: staleRoot, appDir });

  const cleanContent = await readFile(join(cleanRoot, "etc/systemd/system/beatmapped-city-worker.service"), "utf8");
  const staleContent = await readFile(stalePath, "utf8");
  assert.equal(cleanContent, staleContent);
  assert.equal(cleanContent, "CONVERGENT UNIT CONTENT\n");
});

// --- §16 / §17: both deployment modes still behave correctly ---

test("install.sh: the city-worker unit install runs UNCONDITIONALLY — both MAIN and DEPLOY_ONLY reconcile it", async () => {
  const script = await readDeployFile("install.sh");
  // It must sit BEFORE the SKIP_PUBLICATION_RESTART branch, i.e. outside it.
  const ifIdx = script.indexOf('if [ "$SKIP_PUBLICATION_RESTART" -eq 1 ]; then');
  assert.ok(ifIdx > -1);
  const unconditional = executableLines(script.slice(0, ifIdx));
  assert.ok(
    unconditional.includes(CITY_WORKER_UNIT_INSTALL),
    "DEPLOY_ONLY must also register the unit — the flag only ever skips the publication restart",
  );
});

test("install.sh: --skip-publication-restart still leaves botm-publication.service untouched while the city-worker unit is reconciled", async () => {
  const script = await readDeployFile("install.sh");
  const skipBranch = script.slice(
    script.indexOf('if [ "$SKIP_PUBLICATION_RESTART" -eq 1 ]; then'),
    script.indexOf("cat <<EOF"),
  );
  // The skip branch must not restart/enable publication...
  const skipOnly = skipBranch.slice(0, skipBranch.indexOf("else"));
  assert.doesNotMatch(skipOnly, /systemctl (restart|enable) botm-publication\.service/);
  // ...and must not touch the city worker either.
  assert.doesNotMatch(skipBranch, /systemctl (start|restart|enable) beatmapped-city-worker/);
});

test("install.sh: existing unit lifecycles are unchanged — publication still enabled+restarted by default, unattended timer still never enabled", async () => {
  const script = await readDeployFile("install.sh");
  // Executed body only — the printed heredoc names the operator's manual
  // `systemctl enable --now botm-unattended.timer` next step by design.
  const code = executableLines(script.slice(0, script.indexOf("cat <<EOF")));
  assert.match(code, /systemctl enable botm-publication\.service/);
  assert.match(code, /systemctl restart botm-publication\.service/);
  assert.doesNotMatch(code, /systemctl enable botm-unattended\.timer/, "the unattended timer's manual first-run gate must survive");
  assert.doesNotMatch(code, /systemctl start botm-unattended\.(service|timer)/);
});

// --- §13: the operator-facing summary tells the truth ---

test("install.sh: the completion summary states the city worker is installed but NOT started and NOT enabled", async () => {
  const script = await readDeployFile("install.sh");
  const summary = script.slice(script.indexOf("cat <<EOF"));
  assert.match(summary, /beatmapped-city-worker\.service installed\/reconciled/);
  assert.match(summary, /NOT\s*\n?started and NOT enabled|NOT started and NOT enabled/);
  assert.match(summary, /does not authorise it to process city jobs|AVAILABLE to systemd/i);
});
