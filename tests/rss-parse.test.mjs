import assert from "node:assert/strict";
import test from "node:test";
import { extractCategories, extractField, parseRSS, unescapeXmlText } from "../ingestion/rss/parse.mjs";

const SYNTHETIC_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Example Feed</title>
  <link>https://example.test/</link>
  <description>An example feed</description>
  <item>
    <title>First &amp; Only Item</title>
    <description>&lt;p&gt;Contacto: &lt;a href="https://example.test/venue"&gt;Example Venue&lt;/a&gt;&lt;/p&gt;</description>
    <pubDate>Sat, 19 Dec 2026 10:00:00 +0000</pubDate>
    <category>Evento</category>
    <category>Cultura</category>
    <link>https://example.test/item-1</link>
    <guid>https://example.test/item-1</guid>
  </item>
  <item>
    <title><![CDATA[CDATA Item]]></title>
    <guid isPermaLink="false">urn:example:item-2</guid>
  </item>
</channel></rss>`;

test("parseRSS extracts channel-level fields excluding item content", () => {
  const { channel } = parseRSS(SYNTHETIC_RSS);
  assert.equal(channel.title, "Example Feed");
  assert.equal(channel.link, "https://example.test/");
  assert.equal(channel.description, "An example feed");
});

test("parseRSS extracts one record per <item>, in document order", () => {
  const { items } = parseRSS(SYNTHETIC_RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "First & Only Item");
  assert.equal(items[0].link, "https://example.test/item-1");
  assert.equal(items[0].guid, "https://example.test/item-1");
  assert.equal(items[0].pubDate, "Sat, 19 Dec 2026 10:00:00 +0000");
  assert.deepEqual(items[0].categories, ["Evento", "Cultura"]);
});

test("CDATA and attributed tags (guid isPermaLink) are handled", () => {
  const { items } = parseRSS(SYNTHETIC_RSS);
  assert.equal(items[1].title, "CDATA Item");
  assert.equal(items[1].guid, "urn:example:item-2");
  assert.equal(items[1].link, null, "genuinely absent field stays null, never an empty string");
});

test("unescapeXmlText decodes the 5 predefined XML entities and numeric refs", () => {
  assert.equal(unescapeXmlText("A &amp; B &lt;tag&gt; &quot;q&quot; &#39;x&#39;"), 'A & B <tag> "q" \'x\'');
});

test("named HTML entities for accented Portuguese characters fully decode even when double-encoded, as real feeds emit", () => {
  // A literal "ã" appears in the feed's own XML source as "&amp;atilde;"
  // (its HTML entity, itself XML-escaped) — a single naive unescape pass
  // only recovers the intermediate "&atilde;", not "ã"; unescapeXmlText
  // must resolve fully.
  assert.equal(unescapeXmlText("Divis&amp;atilde;o de Cultura"), "Divisão de Cultura");
  assert.equal(unescapeXmlText("Contacta&amp;ccedil;&amp;atilde;o"), "Contactação");
});

test("extractField returns null (never empty string) for a genuinely absent tag", () => {
  assert.equal(extractField("<item><title>x</title></item>", "guid"), null);
});

test("extractCategories returns an empty array (never null) when none are present", () => {
  assert.deepEqual(extractCategories("<item><title>x</title></item>"), []);
});

test("parseRSS rejects empty input rather than silently returning nothing", () => {
  assert.throws(() => parseRSS(""), /non-empty/);
  assert.throws(() => parseRSS(null), /non-empty/);
});

test("real retained Odivelas excerpt parses deterministically", async () => {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(new URL("../fixtures/odivelas/rss-de-eventos-excerpt.rss", import.meta.url), "utf8");
  const first = parseRSS(text);
  const second = parseRSS(text);
  assert.deepEqual(first, second);
  assert.ok(first.items.length >= 1);
  for (const item of first.items) {
    assert.equal(typeof item.title, "string");
    assert.equal(typeof item.guid, "string");
  }
});
