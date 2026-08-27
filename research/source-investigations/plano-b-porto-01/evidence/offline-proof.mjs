#!/usr/bin/env node
// Dependency-free, no-network offline proof for plano-b-porto-01.
//
// This investigation's decision is DEFER — the candidate's official website
// (both the www and bare-domain forms) is currently unreachable. This script
// does NOT parse any live event data (there is none retained — none was
// obtainable). Instead it mechanically re-verifies the *unreachability*
// findings themselves against the retained evidence files, so the
// investigation's central claim ("this source cannot currently be acquired")
// is a reproducible, checked fact rather than a bare assertion.
//
// Run with: node evidence/offline-proof.mjs
// No dependencies. No network access. Reads only files already retained in
// this directory.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf-8");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures += 1;
  }
}

console.log("=== plano-b-porto-01 offline proof ===");
console.log("Verifying retained evidence supports the DEFER decision (site currently unreachable).\n");

// --- 1. DNS lookups (dns-lookups.txt) ---
const dns = read("dns-lookups.txt");
check(
  "dns-lookups.txt records NXDOMAIN for www.planobporto.com",
  /can't find www\.planobporto\.com: Non-existent domain/.test(dns),
);
check(
  "dns-lookups.txt records a resolved A record for the bare domain planobporto.com (50.62.172.212)",
  /Name:\s*planobporto\.com[\s\S]*?Address:\s*50\.62\.172\.212/.test(dns),
);
check(
  "dns-lookups.txt records NS delegation to name-services.com (Network Solutions default DNS)",
  /nameserver = dns\d\.name-services\.com/.test(dns),
);

// --- 2. TLS probe log (tls-probe-log.txt) ---
const tls = read("tls-probe-log.txt");
check(
  "tls-probe-log.txt records a curl/Schannel TLS handshake failure (SEC_E_ILLEGAL_MESSAGE)",
  /SEC_E_ILLEGAL_MESSAGE/.test(tls),
);
check(
  "tls-probe-log.txt records a PowerShell/.NET TLS handshake failure",
  /Could not create SSL\/TLS secure channel/.test(tls),
);
check(
  "tls-probe-log.txt records a WebFetch/OpenSSL TLS handshake failure",
  /SSLV3_ALERT_HANDSHAKE_FAILURE/.test(tls),
);
check(
  "tls-probe-log.txt records WebFetch's own independent DNS resolver also failing for www.planobporto.com",
  /getaddrinfo ENOTFOUND www\.planobporto\.com/.test(tls),
);
// Three independent client stacks all failing is the load-bearing claim.
const independentTlsFailures = [
  /SEC_E_ILLEGAL_MESSAGE/.test(tls),
  /Could not create SSL\/TLS secure channel/.test(tls),
  /SSLV3_ALERT_HANDSHAKE_FAILURE/.test(tls),
].filter(Boolean).length;
check(
  "at least 3 independent TLS client implementations failed the handshake (found " + independentTlsFailures + ")",
  independentTlsFailures >= 3,
);

// --- 3. Plain HTTP (port 80) response (headers-home-http.txt / body-home-http.html) ---
const httpHeaders = read("headers-home-http.txt");
const httpBody = read("body-home-http.html");
check("plain HTTP request to planobporto.com returned status 409", /^HTTP\/1\.1 409/.test(httpHeaders));
check("plain HTTP response headers identify a Cloudflare-fronted edge (Server: cloudflare)", /Server: cloudflare/i.test(httpHeaders));
check(
  'plain HTTP response body is the literal Cloudflare "error code: 1001" (DNS resolution error at the edge)',
  httpBody.trim() === "error code: 1001",
);

// --- 4. robots.txt probe (headers-robots-http.txt / body-robots-http.txt) — same failure mode ---
const robotsHeaders = read("headers-robots-http.txt");
const robotsBody = read("body-robots-http.txt");
check("robots.txt request also returned status 409 (same edge-level failure, not path-specific)", /^HTTP\/1\.1 409/.test(robotsHeaders));
check('robots.txt response body is also the literal Cloudflare "error code: 1001"', robotsBody.trim() === "error code: 1001");

// --- 5. Wayback Machine availability API (confirms historical existence, and that the
//        most recent full snapshot is stale relative to investigation date 2026-08-27) ---
const availWww = JSON.parse(read("body-archive-avail-www.json"));
const availBare = JSON.parse(read("body-archive-avail-bare.json"));
check(
  "archive.org availability API confirms a historical snapshot exists for www.planobporto.com",
  availWww?.archived_snapshots?.closest?.available === true,
);
check(
  "archive.org's closest snapshot for both hostname forms is the same 2022-03-15 capture (timestamp 20220315072517)",
  availWww.archived_snapshots.closest.timestamp === "20220315072517" &&
    availBare.archived_snapshots.closest.timestamp === "20220315072517",
);

// --- 6. CDX snapshot history (body-cdx-recent.txt) — confirms the site was genuinely
//        live for years, with real WordPress-shaped /events/ and /event/{slug}/ URLs,
//        then began returning 404/"-" from Oct 2022 onward. ---
const cdx = read("body-cdx-recent.txt");
const cdxLines = cdx.trim().split("\n").filter(Boolean);
check("CDX snapshot list is non-empty", cdxLines.length > 0);
const eventPathLines = cdxLines.filter((l) => /\/events?\//.test(l));
check(
  `CDX snapshot list contains historical /event/ or /events/ URLs (found ${eventPathLines.length}) — evidence this candidate genuinely once published a WordPress-shaped events listing`,
  eventPathLines.length >= 5,
);
const rootLines = cdxLines.filter((l) => /planobporto\.com(:80)?\/\s+\d{3}\s*$/.test(l) && !/\?/.test(l));
const rootStatuses = rootLines.map((l) => l.trim().split(/\s+/).pop());
check(
  "CDX root-URL snapshots include at least one 200 (site was live)",
  rootStatuses.includes("200"),
);
check(
  "CDX root-URL snapshots include at least one 404 (site later went dark) at or after the last 200",
  rootStatuses.includes("404"),
);
const last200Index = rootLines.map((l, i) => (/\s200$/.test(l) ? i : -1)).filter((i) => i >= 0).pop();
const last404Index = rootLines.map((l, i) => (/\s404$/.test(l) ? i : -1)).filter((i) => i >= 0).pop();
check(
  "the last recorded 404 for the root URL comes chronologically after the last recorded 200 (CDX list is timestamp-ordered ascending)",
  typeof last200Index === "number" && typeof last404Index === "number" && last404Index > last200Index,
);

// --- 7. The 2022-03-15 archived snapshot itself (body-archive-snapshot.html) — historical
//        first-party identity evidence only, not proof of current live status. ---
const snapshot = read("body-archive-snapshot.html");
check('archived snapshot <title> self-identifies as "PLANO B" programme page', /<title>PLANO B/.test(snapshot));
check(
  "archived snapshot links its own Facebook page (facebook.com/planobclub)",
  /facebook\.com\/planobclub/.test(snapshot),
);
check(
  "archived snapshot links its own Instagram page (instagram.com/planobporto)",
  /instagram\.com\/planobporto/.test(snapshot),
);
check(
  "archived snapshot (2022) shows a bespoke Bootstrap-based static-asset build, not a WordPress generator tag — platform had already migrated away from the earlier (2019-2021 CDX) WordPress-shaped URLs",
  /bootstrap@5\.1\.3/.test(snapshot) && !/wp-content|generator" content="WordPress/i.test(snapshot),
);

// --- 8. Third-party corroboration (Songkick) — used ONLY to support DEFER-vs-REJECT
//        reasoning (is this still a real, operating venue?), never as first-party fact
//        authority for any field_assessment value. ---
const songkick = read("body-songkick.html");
const addressMatches = (songkick.match(/Rua C.ndido Dos Reis, 30/g) || []).length;
check(
  `Songkick's own retained page (third-party, not first-party authority) repeats the venue's street address "Rua Cândido Dos Reis, 30" ${addressMatches} time(s), consistent with the prior loose registry lead's physical_address`,
  addressMatches >= 1,
);
const startDates2026 = [...songkick.matchAll(/"startDate":"(2026-\d{2}-\d{2})T/g)].map((m) => m[1]);
check(
  `Songkick's own retained page lists ${startDates2026.length} distinct 2026 event startDate value(s) for this venue — third-party corroboration (not fact authority) that the real-world venue is still actively operating today, supporting DEFER over REJECT`,
  startDates2026.length >= 3,
);

console.log(`\n${failures === 0 ? "OFFLINE PROOF: PASSED" : "OFFLINE PROOF: FAILED"} (${failures} failing check(s))`);
process.exitCode = failures === 0 ? 0 : 1;
