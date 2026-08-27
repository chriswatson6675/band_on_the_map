export function createPlaywrightSessionFactory({ executablePath, launchArgs = ["--disable-dev-shm-usage"] } = {}) {
  if (!executablePath) throw new Error("An explicit Chromium executablePath is required");
  return async ({ userAgent, maxResponseBytes, launchTimeoutMs, allowedContentTypes }) => {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ executablePath, headless: true, args: launchArgs, timeout: launchTimeoutMs });
    const context = await browser.newContext({ userAgent, serviceWorkers: "block" });
    const page = await context.newPage();
    const listeners = [];
    const pending = new Set();
    page.on("response", (response) => {
      const task = (async () => {
        const headers = await response.allHeaders();
        const contentType = headers["content-type"] ?? "";
        if (!allowedContentTypes.some((allowed) => contentType.toLowerCase().includes(allowed))) return;
        const declaredLength = Number(headers["content-length"]);
        const contentEncoding = headers["content-encoding"] ?? "";
        const metadata = { url: response.url(), status: response.status(), content_type: contentType, content_length: Number.isFinite(declaredLength) ? declaredLength : null };
        // Unknown, compressed, or excessive sizes are retained as metadata only; decoded bodies could exceed the byte bound.
        const maxBytes = session.maxResponseBytes;
        if (!Number.isFinite(declaredLength) || contentEncoding || declaredLength > maxBytes) {
          const skipReason = !Number.isFinite(declaredLength) ? "response content length was unavailable" : contentEncoding ? "compressed response could not be decoded within a strict byte bound" : "response exceeded maxResponseBytes";
          listeners.forEach((listener) => listener({ ...metadata, body: "", body_skipped: true, skip_reason: skipReason }));
          return;
        }
        const body = (await response.body()).subarray(0, maxBytes).toString("utf8");
        listeners.forEach((listener) => listener({ ...metadata, body }));
      })().catch(() => {});
      pending.add(task);
      task.finally(() => pending.delete(task));
    });
    const session = {
      maxResponseBytes,
      onResponse(listener) { listeners.push(listener); },
      async navigate(url, { timeoutMs }) {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        return { status: response?.status() ?? null, initialText: await page.locator("body").evaluate((body, limit) => (body.innerText ?? "").slice(0, limit), maxResponseBytes).catch(() => "") };
      },
      wait(milliseconds) { return page.waitForTimeout(milliseconds); },
      async interact() {
        const candidate = page.getByRole("button", { name: /load more|show more|more events|weitere|mehr laden|next/i }).first();
        if (await candidate.count() === 0 || !(await candidate.isVisible().catch(() => false))) return false;
        await candidate.click({ timeout: 2_000 });
        return true;
      },
      async flushResponses() { await Promise.allSettled([...pending]); },
      async snapshot() {
        return {
          html: await page.locator("html").evaluate((html, limit) => html.outerHTML.slice(0, limit), maxResponseBytes),
          text: await page.locator("body").evaluate((body, limit) => (body.innerText ?? "").slice(0, limit), maxResponseBytes).catch(() => ""),
          links: await page.locator("a[href]").evaluateAll((anchors) => anchors.slice(0, 100).map((anchor) => ({ text: anchor.textContent?.trim() ?? "", url: anchor.href }))),
        };
      },
      async close() {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      },
    };
    return session;
  };
}
