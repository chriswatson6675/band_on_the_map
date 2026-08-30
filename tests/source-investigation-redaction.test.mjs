import assert from "node:assert/strict";
import test from "node:test";

import { redactSensitiveText } from "../ingestion/source-investigation/redact-sensitive-text.mjs";

test("retained public-source captures redact token-shaped credentials", () => {
  const jwt = `eyJ${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`;
  const input = `map token sk.${"x".repeat(30)} and bearer ${jwt}`;
  assert.equal(redactSensitiveText(input), "map token [REDACTED_CREDENTIAL] and bearer [REDACTED_CREDENTIAL]");
});

test("ordinary retained source text is unchanged", () => {
  assert.equal(redactSensitiveText("Public programme, 28 August"), "Public programme, 28 August");
});

test("common API-key and named credential shapes are redacted", () => {
  const google = `AIza${"z".repeat(35)}`;
  const queryName = ["api", "key"].join("_");
  const namedKey = ["access", "Token"].join("");
  assert.equal(redactSensitiveText(`${queryName}=${google}`), `${queryName}=[REDACTED_CREDENTIAL]`);
  const namedResult = redactSensitiveText(`${namedKey}: \"${"q".repeat(30)}\"`);
  assert.match(namedResult, /\[REDACTED_CREDENTIAL\]/);
  assert.doesNotMatch(namedResult, /q{20}/);
});
