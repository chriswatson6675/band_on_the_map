import { classifyNetworkResponse, classifyRenderedDom, extractEmbeddedState } from "./classify.mjs";
import { normalizeBrowserProbeOptions } from "./contract.mjs";
import { sanitizeEvidenceText, sanitizeEvidenceUrl } from "./safety.mjs";

function relationship(url, pageUrl) {
  try { return new URL(url).origin === new URL(pageUrl).origin ? "SAME_ORIGIN" : "EXTERNAL_FIRST_PARTY_RELATIONSHIP_UNVERIFIED"; }
  catch { return "UNKNOWN"; }
}

function nextAction(primaryResult) {
  if (["STRUCTURED_ENDPOINT_DISCOVERED", "EXISTING_DETERMINISTIC_CAPABILITY_NOW_APPLIES"].includes(primaryResult)) return "DETERMINISTIC_CONTINUE";
  if (primaryResult === "ACCESS_BLOCKED") return "RETRY_LATER";
  if (["AI_RESEARCH_REQUIRED", "NO_CURRENT_PROGRAMME_DISCOVERED"].includes(primaryResult)) return "AI_RESEARCH_REQUIRED";
  return "DETERMINISTIC_CONTINUE";
}

function summarize({ networks, embedded, dom, limitReached, navigationStatus }) {
  const provenNetwork = networks.filter((item) => item.state === "PROGRAMME_ENDPOINT_PROVEN");
  const likelyNetwork = networks.filter((item) => item.state === "LIKELY_PROGRAMME_ENDPOINT");
  const provenEmbedded = embedded.filter((item) => item.state === "EMBEDDED_PROGRAMME_STATE_PROVEN");
  const blocked = networks.some((item) => item.state === "ACCESS_BLOCKED");
  let primaryResult;
  if ([401, 403, 429].includes(navigationStatus)) primaryResult = "ACCESS_BLOCKED";
  else if (provenNetwork.length) primaryResult = "STRUCTURED_ENDPOINT_DISCOVERED";
  else if (provenEmbedded.length) primaryResult = "EMBEDDED_PROGRAMME_STATE_DISCOVERED";
  else if (dom.state === "RENDERED_DOM_PROGRAMME_ONLY") primaryResult = "RENDERED_DOM_PROGRAMME_DISCOVERED";
  else if (blocked) primaryResult = "ACCESS_BLOCKED";
  else if (likelyNetwork.length) primaryResult = "NEW_GENERIC_CAPABILITY_REQUIRED";
  else if (limitReached) primaryResult = "NEW_GENERIC_CAPABILITY_REQUIRED";
  else primaryResult = "NO_CURRENT_PROGRAMME_DISCOVERED";
  return { primaryResult, provenNetwork, likelyNetwork, provenEmbedded };
}

export async function runControlledBrowserProbe(input, dependencies = {}) {
  if (!input?.url) throw new Error("runControlledBrowserProbe requires a URL");
  const url = new URL(input.url).href;
  const options = normalizeBrowserProbeOptions(input.options);
  if (typeof dependencies.sessionFactory !== "function") throw new Error("sessionFactory is required");
  const now = dependencies.now ?? (() => new Date().toISOString());
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  let session;
  let timedOut = false;
  const responses = [];
  let interactionCount = 0;
  let limitReached = false;
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimer(() => { timedOut = true; reject(new Error("TOTAL_PROBE_TIMEOUT")); }, options.totalProbeTimeoutMs);
  });
  const work = (async () => {
    session = await dependencies.sessionFactory({ userAgent: options.userAgent, maxResponseBytes: options.maxResponseBytes, launchTimeoutMs: options.navigationTimeoutMs, allowedContentTypes: options.allowedContentTypes });
    session.onResponse(async (response) => {
      if (responses.length >= options.maxNetworkResponses) { limitReached = true; return; }
      const relation = relationship(response.url, url);
      if (options.sameOriginOnly && relation !== "SAME_ORIGIN") return;
      const contentType = String(response.content_type ?? "").toLowerCase();
      if (!options.allowedContentTypes.some((allowed) => contentType.includes(allowed))) return;
      responses.push({ ...response, relationship: relation });
    });
    const navigation = await session.navigate(url, { timeoutMs: options.navigationTimeoutMs });
    if (navigation?.initialText !== undefined) session.initialText = navigation.initialText;
    if (options.waitAfterLoadMs) await session.wait(options.waitAfterLoadMs);
    while (interactionCount < options.maxInteractions) {
      const interacted = await session.interact?.({ remaining: options.maxInteractions - interactionCount });
      if (!interacted) break;
      interactionCount += 1;
      if (options.waitAfterLoadMs) await session.wait(options.waitAfterLoadMs);
    }
    await session.flushResponses?.();
    const snapshot = await session.snapshot();
    snapshot.initialText ??= session.initialText;
    return { navigation, snapshot };
  })();

  try {
    const { navigation, snapshot } = await Promise.race([work, timeout]);
    const networkEvidence = responses.map((response) => classifyNetworkResponse(response, options));
    const safeHtml = sanitizeEvidenceText(snapshot.html, options.maxResponseBytes);
    const embedded = extractEmbeddedState(safeHtml, options);
    const dom = classifyRenderedDom({
      html: safeHtml,
      text: sanitizeEvidenceText(snapshot.text, options.maxResponseBytes),
      initialText: sanitizeEvidenceText(snapshot.initialText, options.maxResponseBytes),
      links: (snapshot.links ?? []).slice(0, 100).map((link) => ({ text: sanitizeEvidenceText(link.text, 512), url: sanitizeEvidenceUrl(link.url) })),
    });
    const summary = summarize({ networks: networkEvidence, embedded, dom, limitReached, navigationStatus: navigation?.status ?? null });
    const endpoints = summary.provenNetwork.map((item) => ({
      url: item.url,
      mechanism: item.mechanism,
      relationship: item.relationship,
      pagination: item.pagination_paths?.length ? { evidence_paths: item.pagination_paths } : null,
      deterministic_collector_candidate: item.mechanism === "ICS_OR_ICAL" ? "ICS_CALENDAR" : item.mechanism === "PUBLIC_GRAPHQL" ? "NEW_FAMILY_REQUIRED" : "JSON_API",
    }));
    return {
      schema_version: "BEATMAPPED-BROWSER-RESOLUTION-v1",
      inspected_programme_url: sanitizeEvidenceUrl(url),
      probed_at: now(),
      state: summary.provenNetwork[0]?.state ?? summary.provenEmbedded[0]?.state ?? dom.state,
      primary_result: summary.primaryResult,
      navigation_status: navigation?.status ?? null,
      interactions_performed: interactionCount,
      network_responses_considered: networkEvidence.length,
      limit_reached: limitReached,
      discovered_endpoints: endpoints,
      embedded_state: embedded,
      rendered_dom: dom,
      network_evidence: networkEvidence,
      collector_fit: endpoints.some((item) => item.deterministic_collector_candidate !== "NEW_FAMILY_REQUIRED") ? "EXISTING_COLLECTOR_ZERO_CODE" : summary.primaryResult === "NEW_GENERIC_CAPABILITY_REQUIRED" ? "NEW_REUSABLE_COLLECTOR_FAMILY" : "NEEDS_DEEPER_INVESTIGATION",
      browser_required_for_refresh: endpoints.length === 0 && summary.primaryResult === "RENDERED_DOM_PROGRAMME_DISCOVERED",
      revalidation_recommendation: endpoints.length ? "Verify the stored endpoint deterministically before returning to browser resolution." : "Repeat browser resolution only after the configured retry/revalidation interval.",
      next_action: nextAction(summary.primaryResult),
    };
  } catch (error) {
    return {
      schema_version: "BEATMAPPED-BROWSER-RESOLUTION-v1",
      inspected_programme_url: sanitizeEvidenceUrl(url),
      probed_at: now(),
      state: timedOut ? "PROBE_LIMIT_REACHED" : "NO_PROGRAMME_DATA_DISCOVERED",
      primary_result: "TECHNICAL_PROBE_FAILURE",
      failure: { type: timedOut ? "TOTAL_PROBE_TIMEOUT" : "BROWSER_PROBE_ERROR", message: sanitizeEvidenceText(error instanceof Error ? error.message : String(error), 2_048), retry_suitable: true, ai_suitable: false, access_blocked: false },
      discovered_endpoints: [],
      browser_required_for_refresh: null,
      next_action: "RETRY_LATER",
    };
  } finally {
    clearTimer(timeoutHandle);
    await session?.close?.();
  }
}
