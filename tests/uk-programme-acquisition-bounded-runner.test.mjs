import assert from "node:assert/strict";
import test from "node:test";

import { runBoundedWithCallback } from "../ingestion/uk-programme-acquisition/bounded-runner.mjs";

test("onItemComplete fires incrementally as each item finishes, not only after the whole batch settles", async () => {
  const completedInOrder = [];
  const items = [
    { id: "slow", website: "https://a.example.com/", delay: 30 },
    { id: "fast", website: "https://b.example.com/", delay: 5 },
  ];
  await runBoundedWithCallback(
    items,
    async (item) => {
      await new Promise((r) => setTimeout(r, item.delay));
      return item.id;
    },
    {
      concurrency: 2,
      perHost: 1,
      onItemComplete: async (item, result) => {
        completedInOrder.push(result);
      },
    },
  );
  assert.deepEqual(completedInOrder, ["fast", "slow"], "the faster item must be checkpointed before the slower one, proving completion is incremental");
});

test("every item is processed exactly once, in the presence of concurrency", async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: i, website: `https://host-${i}.example.com/` }));
  const seen = [];
  await runBoundedWithCallback(items, async (item) => item.id, {
    concurrency: 5,
    perHost: 1,
    onItemComplete: (item, result) => { seen.push(result); },
  });
  assert.deepEqual([...seen].sort((a, b) => a - b), items.map((i) => i.id));
});

test("perHost=1 serialises two items sharing the same host even under this runner", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const items = [
    { id: "a", website: "https://shared.example.com/a" },
    { id: "b", website: "https://shared.example.com/b" },
  ];
  await runBoundedWithCallback(
    items,
    async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent -= 1;
    },
    { concurrency: 4, perHost: 1 },
  );
  assert.equal(maxConcurrent, 1);
});

test("a worker that throws for ONE item never aborts the batch — the error is reported via onItemComplete's 4th argument, and every other item still completes", async () => {
  const items = [
    { id: "bad", website: "https://bad.example.com/" },
    { id: "good", website: "https://good.example.com/" },
  ];
  const completions = [];
  await runBoundedWithCallback(
    items,
    async (item) => {
      if (item.id === "bad") throw new Error("boom");
      return "ok";
    },
    {
      concurrency: 2,
      onItemComplete: (item, result, index, error) => {
        completions.push({ id: item.id, result, error: error ? String(error) : null });
      },
    },
  );
  assert.equal(completions.length, 2, "both items must be reported, including the one whose worker threw");
  const bad = completions.find((c) => c.id === "bad");
  const good = completions.find((c) => c.id === "good");
  assert.equal(bad.result, undefined);
  assert.match(bad.error, /boom/);
  assert.equal(good.result, "ok");
  assert.equal(good.error, null);
});
