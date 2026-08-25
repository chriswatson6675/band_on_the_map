// SYNTHETIC FIXTURE — retained excerpt of a public JS application bundle,
// authored directly for this governance fixture (never fetched live).
// Demonstrates Level 2 (STRUCTURAL) inspection: the bundle references an
// internal data endpoint but exposes no public JSON/feed/API path and no
// embedded event data of its own.
(function () {
  function loadEvents() {
    return fetch("/internal/api/events", { credentials: "include" });
  }
  window.__exampleApp = { loadEvents: loadEvents };
})();
