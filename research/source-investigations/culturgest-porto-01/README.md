# culturgest-porto-01

A new, governed source investigation of **Culturgest Porto**, run under
`BOTM-SOURCE-INVESTIGATION-v1.2`, per `docs/SOURCE_INVESTIGATION_POLICY.md`.

Nothing in this directory changes `sources/*.json`, any `venues/*.json`
registry, `venues/manual-coordinates.json`, public map data, or scheduler
configuration. `investigation.json` records a research conclusion, not an
activation.

## Why this investigation exists

`sources/porto.json` already has a `DISCOVERED`-lifecycle entry for
`culturgest-porto` (official_website `https://www.culturgest.pt`, events_url
`https://www.culturgest.pt/pt/programacao/por-evento/`), with a research note
already flagging the core complication: **Culturgest operates two physical
venues -- Culturgest Lisboa and Culturgest Porto -- sharing one website and
one shared programme listing.** The registry entry's own
`acquisition_path_detail` already noted the programme page's event container
is client/AJAX-populated and that the actual data endpoint had not yet been
located. This investigation starts fresh from Level 1 against the live site
to (a) actually find that data path, and (b) -- the harder, more important
part of this task -- determine, from real retained first-party evidence,
which events genuinely belong to the Porto location versus Lisboa, rather
than assuming or guessing.

## What this investigation found

**The acquisition mechanism is real and reasonably clean.** The shell page's
own inline `<script>` tags statically expose two endpoint paths
(`window.filter_list_url`, `window.event_list_url`). A naive plain GET
against them 404s; inspecting the site's own linked compiled JS bundle
revealed why -- the server keys off a standard `X-Requested-With:
XMLHttpRequest` content-negotiation header, not a browser fingerprint or a
session secret. Adding that single header to a plain `curl` request
immediately returns real, server-rendered HTML fragments: the full current
agenda, and -- crucially -- the site's own filter-widget fragment
(`/pt/programacao/filtrar/`), which reveals a first-party **place**
taxonomy: `place=1` Lisboa, `place=2` Porto, `place=3` Fora de Portas
(off-site elsewhere in Portugal), alongside a `typology` taxonomy including
`typology=8` Música.

**The decisive finding: Culturgest Porto currently has zero music events.**
Using the source's own `place=2&typology=8` server-side filter (not a guess,
not visual proximity, not an external inference -- the exact mechanism the
site's own visible filter UI uses) against the full current 35-event
agenda:

| Filter | Event count |
|---|---|
| Unfiltered (all events, all places) | 35 |
| `place=1` (Lisboa) | 32 |
| `place=2` (Porto) | 1 |
| `place=3` (Fora de Portas) | 2 |
| `typology=8` (Música, all places) | 11 |
| `place=2` AND `typology=8` (Porto + Música) | **0** |

The one and only event genuinely tagged as being in Porto --
*"A Colecção Ormsson apresentada por João Penalva"* -- is a visual-arts
exhibition (typology `Artes Visuais`), running 3 Oct 2026 -- 10 Jan 2027 at
"Culturgest Porto" (both stated directly on its own detail page), with free
admission. It is not music. All 11 currently-listed music events on the
shared site are Lisboa events (e.g. Kali Malone at "Auditório Emílio Rui
Vilar", 23 Sep 2026 21:00, €18 -- sampled only as a general cross-check that
the source's template CAN express a clean single-instant concert date+time
directly; this is explicitly Lisboa evidence, never promoted as a Porto
fact).

All of the above is mechanically re-derived, offline, with zero network
access, in `evidence/offline-proof.mjs` (18/18 checks pass -- see
`evidence/offline-proof-output.txt`).

## Escalation ladder

- **Level 1 (`PASSIVE_STATIC`) -- `INSUFFICIENT`.** A plain GET of the shell
  page confirms the existing registry note (event container present but
  empty). A naive follow-up plain GET of the endpoint path found in the
  page's own inline script 404s.
- **Level 2 (`STRUCTURAL`) -- `SUFFICIENT`.** Inspecting the site's own
  linked compiled JS bundle explained the 404 (missing content-negotiation
  header, not a browser/session requirement) and revealed the place/typology
  filter mechanism. Reproducing it via plain `curl` fully answered
  acquisition, platform classification, and -- most importantly -- the
  Porto-vs-Lisboa scoping question. **No browser was used anywhere in this
  investigation.**

## Decision

**`decision.status: "DEFER"`.**

The acquisition mechanism itself is genuinely sound (`identity.status:
PROVEN`, `site_classification.acquisition_class: STATIC_HTML`, multiple
`data_paths` entries `PUBLIC`/`CONFIRMED`) -- but Culturgest Porto simply has
no music content right now for a collector to be built or validated
against. Recommending `READY_FOR_ACTIVATION` for a Porto music source with
zero current Porto music events would not be an honest conclusion, even
though the general mechanism (proven partly via Lisboa cross-check content)
works. Per `docs/SOURCE_INVESTIGATION_POLICY.md`, a source must never be
activated "solely because a sample looks right," and general site-wide
capability must not be conflated with genuine evidence for the specific
candidate under investigation.

`DEFER` is a complete, legitimate outcome under this policy and does not
require exhausting the escalation ladder -- Level 2 was sufficient to answer
every question this investigation needed to answer, including the negative
one.

This finding is not necessarily permanent. If Culturgest Porto programs live
music in the future, the exact same `place=2&typology=8` query this
investigation used to reach zero today is a cheap, well-documented,
non-browser recheck for a future, evidence-driven re-investigation (which
would set `supersedes: "culturgest-porto-01"` per "History and supersession"
in the policy, rather than editing this record in place).

See `investigation.json`'s `decision.reasons` for the full, evidenced,
gate-by-gate rationale, and `field_assessment` for the honest, per-field
findings (including the `NOT_PRESENT`/`UNKNOWN` fields -- a multi-day
exhibition's time-of-day and the unproven URL-slug identity candidate -- that
were never smoothed over into a false `PROVEN`).
