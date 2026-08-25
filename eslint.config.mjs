import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Retained third-party evidence files (e.g. a venue's own public JS,
    // captured verbatim for a governed source investigation per
    // docs/SOURCE_INVESTIGATION_POLICY.md) are raw external material, not
    // code this project authored or maintains — never lint them.
    "research/source-investigations/**/evidence/**",
  ]),
]);

export default eslintConfig;
