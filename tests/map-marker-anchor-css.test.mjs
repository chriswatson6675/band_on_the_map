import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// BOTM-MAP-MARKER-ANCHOR-FIX-01: components/DiscoveryMap.tsx's
// createMarkerElement() builds the exact DOM element passed to
// `new Marker({ element: el })`, and MapLibre applies its own
// `.maplibregl-marker` class to that SAME element to control its
// geographic screen positioning (position: absolute; top: 0; left: 0;
// paired with a per-frame inline `transform: translate(...)`). app/
// globals.css's `.botm-marker` rule targets that identical root element.
// Redeclaring `position` (especially `relative`) or a `transform` on this
// rule fights MapLibre's own positioning and causes markers to visually
// drift from their geographic coordinate — this is exactly the bug this
// package fixed. This test is a deliberately simple, regex-based guard
// (not a full CSS parser) against that regressing: it isolates only the
// standalone `.botm-marker { ... }` rule body — never `.botm-marker-pin`,
// `.botm-marker-pulse`, or a compound selector like
// `.botm-marker:hover .botm-marker-pin` — and asserts it declares neither
// `position` nor `transform`. Animation/scaling must stay confined to the
// CHILD elements (`.botm-marker-pin`, `.botm-marker-pulse`); this root
// must remain a stable anchor MapLibre alone controls.

const GLOBALS_CSS_PATH = new URL("../app/globals.css", import.meta.url);

function extractStandaloneRootRule(css) {
  // Matches only ".botm-marker" immediately followed by optional
  // whitespace then "{" — i.e. the bare, standalone selector. A compound
  // selector like ".botm-marker:hover ..." or ".botm-marker.is-active ..."
  // never reaches "{" directly after ".botm-marker", so it is excluded. A
  // suffixed class like ".botm-marker-pin"/".botm-marker-pulse" is
  // excluded by the negative lookahead against a following word/hyphen
  // character.
  const match = css.match(/\.botm-marker(?![\w-])\s*\{([^}]*)\}/);
  return match ? match[1] : null;
}

test("app/globals.css: the standalone .botm-marker rule exists exactly once", async () => {
  const css = await readFile(GLOBALS_CSS_PATH, "utf8");
  const occurrences = css.match(/\.botm-marker(?![\w-])\s*\{/g) ?? [];
  assert.equal(occurrences.length, 1, "expected exactly one standalone .botm-marker { ... } rule");
});

test("app/globals.css: .botm-marker (the MapLibre marker root) does not declare `position` — MapLibre's own .maplibregl-marker { position: absolute } must apply uncontested", async () => {
  const css = await readFile(GLOBALS_CSS_PATH, "utf8");
  const body = extractStandaloneRootRule(css);
  assert.ok(body, "could not locate the standalone .botm-marker rule");
  assert.doesNotMatch(body, /\bposition\s*:/, `.botm-marker must not declare position (found: ${body})`);
});

test("app/globals.css: .botm-marker (the MapLibre marker root) does not declare `transform` — animation/scaling must stay on child elements only", async () => {
  const css = await readFile(GLOBALS_CSS_PATH, "utf8");
  const body = extractStandaloneRootRule(css);
  assert.ok(body, "could not locate the standalone .botm-marker rule");
  assert.doesNotMatch(body, /\btransform\s*:/, `.botm-marker must not declare transform (found: ${body})`);
});

test("app/globals.css: scaling/animation on hover and active state remains scoped to a .botm-marker-* CHILD element (pin/pulse/tooltip/label/...), never the .botm-marker root itself", async () => {
  const css = await readFile(GLOBALS_CSS_PATH, "utf8");
  // Every transform: declaration anywhere near a .botm-marker rule must be
  // inside a rule whose selector reaches SOME suffixed child class
  // (.botm-marker-pin, .botm-marker-pulse, .botm-marker-tooltip,
  // .botm-marker-label, or any future .botm-marker-* child added under
  // this same invariant — see BOTM-MAP-DISCOVERY-UX-01), never the bare
  // root. This intentionally does not hardcode an exact child-class list:
  // the invariant this guards is "child only, never root", not "only
  // these two specific children".
  const transformRules = css.match(/\.botm-marker[^{]*\{[^}]*transform\s*:[^}]*\}/g) ?? [];
  assert.ok(transformRules.length > 0, "sanity: expected at least the hover/active pin-scale rules to exist");
  for (const rule of transformRules) {
    const selector = rule.slice(0, rule.indexOf("{"));
    assert.ok(
      /\.botm-marker-[\w-]+/.test(selector),
      `a transform: declaration must be scoped to a child element selector, not: ${selector.trim()}`,
    );
  }
});

test("app/layout.tsx: maplibre-gl.css is imported before app/globals.css — the cascade order this fix's reasoning (and this whole test file) depends on", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const maplibreIndex = layout.indexOf("maplibre-gl/dist/maplibre-gl.css");
  const globalsIndex = layout.indexOf("./globals.css");
  assert.ok(maplibreIndex !== -1, "expected an import of maplibre-gl/dist/maplibre-gl.css");
  assert.ok(globalsIndex !== -1, "expected an import of ./globals.css");
  assert.ok(maplibreIndex < globalsIndex, "maplibre-gl.css must be imported before globals.css");
});
