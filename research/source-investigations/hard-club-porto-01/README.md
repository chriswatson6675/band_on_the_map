# hard-club-porto-01

This is a **real trial investigation**, not an activation. It follows
`docs/SOURCE_INVESTIGATION_POLICY.md`'s governed escalation ladder against
the live public website of Hard Club, a venue in the Mercado Ferreira
Borges building, Porto, Portugal. Nothing in this directory changes
`sources/*.json`, any `venues/*.json` registry, or public map data —
`investigation.json` is a research conclusion, not an activation.

## What this investigation found

**Identity — confirmed independently.** `https://www.hardclubporto.com/`
self-identifies as Hard Club throughout (title tags, footer branding,
`instagram.com/hardclubporto`, `facebook.com/hardclubporto`), and its own
"o hard club" about page explicitly names "Mercado Ferreira Borges" as its
building. This was re-fetched and re-checked live in this investigation
(2026-08-25), not assumed from the older note.

**The event list is client-rendered.** The public agenda page
(`/PT/agenda/`) ships an empty `<ul class="item"></ul>` shell — no
server-rendered cards, no JSON-LD, no RSS/ICS. The real event data is
loaded by the page's own jQuery via a first-party AJAX endpoint,
`/include/ajax_functions.php`, referenced directly in `js/funcoes.js`
(`action=load-agenda` for the list, `action=loadevent` for a per-event
price/description panel). This endpoint is publicly referenced by the
site's own script — it was not brute-forced or guessed.

**The key finding — a genuinely new result, not a re-confirmation of the
old one.** A naive, single-request fetch of `load-agenda` (Level 1/2 in
this investigation) reproduces exactly the ambiguity the older
`sources/porto.json` entry recorded: the event's `"data"` field carries
only a bare day-of-month ("11 "), never a month. But a Level 3 Playwright
browser session, loading the page as an ordinary visitor, showed the
**same endpoint return a different response**: full day+abbreviated-month
text ("11 Set", "01 Out", "29 Jan") for every one of the 22 currently
listed events. Comparing the two, the only variable that changed was that
the browser had already performed a normal prior page load of
`/PT/agenda/` in the same session before calling the AJAX endpoint.

This was then independently reproduced **without any browser at all**:
`GET /PT/agenda/` once to receive a `PHPSESSID` cookie, then `GET
/include/ajax_functions.php?action=load-agenda&...` reusing that cookie
plus a `Referer` header, reliably returns the full day+month text
(`evidence/ajax-agenda-session.html`, byte-shape matching the browser
observation). A second, independently retained cold fetch with
browser-like headers but no prior page load
(`evidence/ajax-noprior.html`) still comes back day-only, ruling out
headers/User-Agent as the actual cause and isolating the real one: the
two-step, session-establishing HTTP flow.

**What is still genuinely unresolved: the year.** No structural response
— list fragment, detail fragment, or event-detail page — ever states a
calendar year for any event. The URL slug carries a trailing year-like
suffix (e.g. `-2026`, `-2027`) that looks consistent with chronological
order, and one sampled event's own free-text description (U.D.O., dated
"29 Jan") explicitly mentions "2027" — but this investigation deliberately
does **not** infer a year from list sequence/order (the prior
`sources/porto.json` note already flagged that exact trap and this
investigation respects it), and does not treat a slug convention as a
documented date guarantee. `field_assessment.start_date` is honestly
recorded `PARTIAL`, not `PROVEN`.

## Agreement / disagreement with the older `sources/porto.json` note

**Agrees:** the underlying data source, the AJAX endpoint, and the
day-of-month-only behaviour of a naive fetch are all exactly as the older
note (`hard-club-porto`, research `BOTM-RESEARCH-PORTO-SOURCES-01` /
`PORTO-COVERAGE-02`) described. The year-ambiguity gap is real and this
investigation does not paper over it.

**Disagrees / supersedes in substance (though this record does not set
`supersedes`, since it is a fresh, independent re-investigation rather
than a continuation of that non-governed note):** the older note treated
month resolution as apparently unrecoverable ("this bounded proof could
not establish an honest, unambiguous month... not implemented tonight on
that basis"). This investigation found that month **is** reliably
recoverable — the missing piece was a two-step, session-establishing HTTP
flow, discoverable only by escalating to a real browser observation
(Level 3) and then reproducing what it revealed. Day, month, room, local
time, title, price, ticket link, and a reasonably provable stable
`source_record_id` (the event's own canonical URL slug) are now all
confirmed extractable, deterministically, offline, against retained
fixtures (`evidence/offline-proof.mjs`, `evidence/offline-proof-output.txt`,
exit 0, "OFFLINE PROOF: PASSED"). Only the year remains open.

## What a future investigator/collector-builder should know

1. **Always warm the session first.** `GET /PT/agenda/` (or any page on
   the site) once, keep the `PHPSESSID` cookie, then call
   `/include/ajax_functions.php?action=load-agenda&start=0&langid=1&passo=N&evento=`
   with that cookie and a `Referer` header. Skipping the warm-up silently
   returns day-only dates with no error — it will not fail loudly.
2. **Use the URL slug, not `data-rel`, as the identifier.** Each event's
   anchor carries both a stable `id`/URL-slug attribute and an unstable
   numeric `data-rel` position index that resets across pagination. Only
   the slug is safe as `source_record_id` — see
   `evidence/ajax-loadevent-badparams-attempt.html` for what happens when
   the numeric value is used by mistake (an empty response).
3. **Price/description need a second call.** `action=loadevent` with
   `id={slug}&type=load-agenda&index={data-index}` returns price, an
   external ticket link, and a free-text description — not present in the
   list fragment itself.
4. **The year problem is a policy decision, not a technical one.** A
   collector could plausibly adopt a today-relative rollover heuristic
   (increment year each time month/day decreases going forward through the
   list) consistent with this project's existing date-certainty
   conventions — but that is a deliberate design choice this investigation
   is not authorised to make silently, per
   `docs/SOURCE_INVESTIGATION_POLICY.md`'s prohibition on inferring dates
   from sequence/order. See `collector_assessment.blockers` (MAJOR) in
   `investigation.json`.
5. **Recommended collector family:** `STATIC_EVENT_LIST` — the acquisition
   itself needs no persistent browser, only a two-request HTTP flow with
   cookie handling, which any HTTP client library supports.

## Decision

`decision.status: "HUMAN_REVIEW"` — not `DEFER` (the acquisition path is
genuinely strong and a material improvement on the prior finding, so
`DEFER` would understate it), and not `READY_FOR_ACTIVATION` (the year gap
is real and its resolution is a deliberate policy call this investigation
should not make for itself). See `investigation.json`'s `decision.reasons`
for the full, evidenced rationale.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per `docs/SOURCE_INVESTIGATION_POLICY.md`.
