#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  SOURCE_ENDPOINT,
  SOURCE_NAME,
  USER_AGENT,
  parseJsonPayload,
  selectRepresentativeSample,
  summariseRecords,
} from "./contract.mjs";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SAMPLE_SIZE = 10;

function parseArgs(argv) {
  const args = {
    endpoint: SOURCE_ENDPOINT,
    output: null,
    sampleSize: DEFAULT_SAMPLE_SIZE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === "--sample-size") {
      args.sampleSize = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--endpoint") {
      args.endpoint = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const retrievedAt = new Date().toISOString();
  const response = await fetchWithTimeout(args.endpoint, args.timeoutMs);
  const body = await response.text();
  const contentType = response.headers.get("content-type");

  const diagnostics = {
    endpoint: args.endpoint,
    status: response.status,
    ok: response.ok,
    contentType,
    bytes: body.length,
    retrievedAt,
  };

  if (!response.ok) {
    console.error(JSON.stringify({ ...diagnostics, error: "HTTP response was not OK" }, null, 2));
    process.exitCode = 1;
    return;
  }

  let records;
  try {
    records = parseJsonPayload(body, contentType);
  } catch (error) {
    console.error(JSON.stringify({ ...diagnostics, error: error.message }, null, 2));
    process.exitCode = 1;
    return;
  }

  const summary = summariseRecords(records);
  const sample = selectRepresentativeSample(records, args.sampleSize);
  const result = {
    ...diagnostics,
    sourceName: SOURCE_NAME,
    totalRecords: summary.totalRecords,
    musicClassifiableRecords: summary.musicClassifiableRecords,
    sampleSize: sample.length,
    musicMatches: summary.musicMatches.slice(0, 10),
  };

  console.log(JSON.stringify(result, null, 2));

  if (args.output) {
    const outputPath = resolve(args.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          metadata: {
            retrieved_at: retrievedAt,
            endpoint: args.endpoint,
            http_status: response.status,
            source_name: SOURCE_NAME,
            content_type: contentType,
            total_records_observed: summary.totalRecords,
            sample_size: sample.length,
          },
          records: sample,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
