import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CONFIG = fileURLToPath(new URL("../deploy/research-worker/cloud-init.yml", import.meta.url));

test("research worker cloud-init is non-root, browser-capable, and contains no production credential", async () => {
  const source = await readFile(CONFIG, "utf8");
  assert.match(source, /name: botm-research/);
  assert.match(source, /PermitRootLogin no/);
  assert.match(source, /PasswordAuthentication no/);
  assert.match(source, /BEATMAPPED-RESEARCH-WORKER-v1/);
  assert.match(source, /node_22\.x/);
  assert.match(source, /google-chrome-stable/);
  assert.match(source, /REPLACE_WITH_DEDICATED_ED25519_PUBLIC_KEY/);
  assert.doesNotMatch(source, /PRIVATE KEY|BEATMAPPED_PROD_|\/opt\/band-on-the-map|actions\.runner|systemctl enable/);
});
