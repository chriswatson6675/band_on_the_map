import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USER_AGENT = "BeatMapped/0.1 bounded venue research (+https://github.com/chriswatson6675/band_on_the_map)";
const MAX_BYTES = 128 * 1024;

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function resultUrl(rawHref) {
  const decoded = decodeHtml(rawHref);
  try {
    const url = new URL(decoded, "https://html.duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.href;
  } catch {
    return decoded;
  }
}

function parseResults(html) {
  const blocks = [...html.matchAll(/<div[^>]+class="[^"]*result(?:\s|__)[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*result(?:\s|__)[^"]*"|<div[^>]+class="nav-link|<\/body>)/gi)].map((match) => match[1]);
  const results = [];
  for (const block of blocks) {
    const anchor = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const snippet = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)(?:<\/a>|<\/div>)/i);
    results.push({
      title: plainText(anchor[2]),
      url: resultUrl(anchor[1]),
      snippet: snippet ? plainText(snippet[1]) : "",
    });
    if (results.length === 8) break;
  }
  return results;
}

async function fetchBounded(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: controller.signal });
    const reader = response.body?.getReader();
    const chunks = [];
    let total = 0;
    if (reader) {
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = MAX_BYTES - total;
        chunks.push(value.subarray(0, remaining));
        total += Math.min(value.byteLength, remaining);
        if (value.byteLength >= remaining) {
          await reader.cancel();
          break;
        }
      }
    }
    return { status: response.status, final_url: response.url, body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8") };
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCandidate(candidate) {
  const name = candidate.reported_names[0];
  const query = `\"${name}\" Berlin venue music events 2026`;
  const requestedUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const acquiredAt = new Date().toISOString();
  try {
    const response = await fetchBounded(requestedUrl);
    return {
      candidate_id: candidate.candidate_id,
      name,
      query,
      requested_url: requestedUrl,
      final_url: response.final_url,
      acquired_at: acquiredAt,
      http_status: response.status,
      evidence_class: "DIRECT_EVIDENCE",
      byte_faithful: false,
      limitation: response.status === 200 ? null : `Search response returned HTTP ${response.status}.`,
      results: response.status === 200 ? parseResults(response.body) : [],
    };
  } catch (error) {
    return {
      candidate_id: candidate.candidate_id,
      name,
      query,
      requested_url: requestedUrl,
      final_url: null,
      acquired_at: acquiredAt,
      http_status: null,
      evidence_class: "DIRECT_EVIDENCE",
      byte_faithful: false,
      limitation: error instanceof Error ? error.message : String(error),
      results: [],
    };
  }
}

export async function run({ triagePath, outputPath, concurrency = 2, repoRoot = process.cwd() }) {
  const triage = JSON.parse(await readFile(resolve(repoRoot, triagePath), "utf8"));
  const candidates = triage.candidate_ledger.filter((candidate) => candidate.primary_status === "INSUFFICIENT_EVIDENCE");
  if (candidates.length !== 100) throw new Error(`expected 100 insufficient-evidence candidates, got ${candidates.length}`);
  const records = new Array(candidates.length);
  let next = 0;
  async function worker() {
    while (next < candidates.length) {
      const index = next++;
      records[index] = await searchCandidate(candidates[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  const artifact = {
    artifact_type: "BERLIN_INSUFFICIENT_EVIDENCE_SEARCH_CAPTURE",
    generated_at: new Date().toISOString(),
    input_triage: triagePath.replace(/\\/g, "/"),
    evidence_boundary: "One bounded public search-result request per candidate. Parsed result titles, URLs, and snippets are discovery evidence, not first-party authority.",
    candidate_count: records.length,
    records,
  };
  const target = resolve(repoRoot, outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.triage || !args.output) throw new Error("--triage and --output are required");
  const artifact = await run({ triagePath: args.triage, outputPath: args.output, concurrency: args.concurrency ? Number(args.concurrency) : 2 });
  console.log(JSON.stringify({ candidates: artifact.candidate_count, with_results: artifact.records.filter((record) => record.results.length > 0).length, limited: artifact.records.filter((record) => record.limitation).length }, null, 2));
}
