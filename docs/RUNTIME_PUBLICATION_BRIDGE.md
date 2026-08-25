# Runtime Publication Bridge

Reviewed: 2026-08-25
Task: `BOTM-RUNTIME-PUBLICATION-BRIDGE-01`

The public site (`app/page.tsx`) is deployed on **Netlify**, and Next.js
inlines the site's map data via a **build-time static import** of
`data/public/lisbon-porto-map.json`. That means every genuinely fresh
collection cycle (`npm run unattended`, twice-daily on a future
DigitalOcean host — see `docs/UNATTENDED_RUNNER.md`) would otherwise only
reach real visitors after a brand-new Netlify build. This package closes
that gap **without** giving the collection host any way to write to
GitHub, and without requiring a Netlify rebuild for a data refresh.

## The chain

```text
DigitalOcean unattended runner (npm run unattended, twice-daily)
  -> writes data/public/lisbon-porto-map.json atomically (unchanged,
     existing BOTM-PUBLIC-MAP-LIVE-DATA-01 machinery)
  -> read-only publication HTTP service reads that SAME file on demand
     (npm run serve:map-data, ingestion/publication-server/run.mjs)
  -> (future) HTTPS reverse proxy in front of that service
     (NOT built in this package -- see "HTTPS boundary" below)
  -> public BOTM website (already built + deployed on Netlify) fetches
     that endpoint client-side, in the visitor's browser, on every page
     load (ingestion/map/runtime-publication.mjs's resolveMapData(),
     wired into app/page.tsx)
  -> if that fetch is unset, unreachable, slow, malformed, or fails
     publication-artifact schema validation, the page falls back to the
     bundled data/public/lisbon-porto-map.json that shipped with the
     last Netlify build -- the map is NEVER left blank
```

No step in this chain ever writes to GitHub, commits, pushes, opens a
PR, or triggers a Netlify rebuild. Application code deployment (Netlify,
on a Git push) and gig-data refresh (this bridge, at any time,
independently) are two fully separate concerns.

## Why a client-side fetch, not "a different build-time fetch"

`NEXT_PUBLIC_BOTM_MAP_DATA_URL` is inlined into the JavaScript bundle at
**build time** -- but it is only a URL *string*. The actual `fetch()`
call that uses that string runs **client-side, in the visitor's
browser, after hydration**, on every page load -- independent of when
the Netlify build happened. So changing what the publication service
returns (a new collection run's output) changes what real visitors see
on their very next page load, with **no new build, no new deploy,**
required. This is proven directly (not just asserted) in this package --
see "Product proof" below.

## Publication service

```bash
npm run serve:map-data
```

Entry point: `ingestion/publication-server/run.mjs`. A small, dependency-
free `node:http` service (no framework) with exactly two routes:

- `GET /map-data` -- the full, current publication artifact (the SAME
  shape and SAME `validatePublicationArtifact()` schema check as
  `data/public/lisbon-porto-map.json`), reused unchanged from
  `ingestion/map/publication.mjs`. An unreadable, malformed, or
  schema-invalid artifact returns an explicit `503`/`502` error --
  **never** an empty map returned as a `200` success.
- `GET /health` -- `{ status, checked_at, artifact_readable,
  generated_at | detail }`.

Read-only: this service never writes, mutates, or deletes anything;
never runs a collector; never shells out; never serves an arbitrary
filesystem path or lists a directory; has no admin/write API of any
kind. Any method other than `GET`/`OPTIONS` is refused with `405`; any
path other than the two above is `404`.

### Configuration (environment variables, no hardcoded host)

| Variable                            | Default        | Purpose                                   |
|--------------------------------------|----------------|--------------------------------------------|
| `BOTM_PUBLICATION_HOST`             | `127.0.0.1`    | Bind address -- safe local-only default   |
| `BOTM_PUBLICATION_PORT`             | `8787`         | Bind port                                 |
| `BOTM_PUBLICATION_ALLOWED_ORIGIN`   | `*`            | `Access-Control-Allow-Origin` value       |
| `BOTM_PUBLICATION_ARTIFACT_PATH`    | (canonical path resolved from repo root) | Override, used by tests |

### CORS

Public, read-only, uncredentialed data -- no cookies, no auth. The
response sets `Access-Control-Allow-Origin` (default `*`) and `Vary:
Origin`; it **never** sets `Access-Control-Allow-Credentials`. Once the
live BOTM site origin is known, tighten this by setting
`BOTM_PUBLICATION_ALLOWED_ORIGIN=https://<the real origin>` -- no code
change required.

## Website data loading

`app/page.tsx` reads `NEXT_PUBLIC_BOTM_MAP_DATA_URL` at build time (a
plain string, no credential, no hostname hardcoded in source). At
runtime, in the browser:

- **unset** -> renders the bundled artifact immediately, no network call
  at all.
- **set** -> tries the runtime endpoint (`ingestion/map/
  runtime-publication.mjs`'s `resolveMapData()`, 4s default timeout via
  `AbortController`); a validated response replaces the bundled data and
  the page re-renders with it.
- **any failure** (timeout, network error, non-2xx, malformed JSON --
  including an HTML/error page served with a `200` -- or a payload that
  fails `validatePublicationArtifact()`) -> keeps rendering the bundled
  data. The map is never left blank merely because the runtime service
  is temporarily unreachable.

A `data-map-data-source="runtime"|"bundled"` attribute on the page's
outermost `<main>` element records which dataset is actually being
rendered -- no visible UI redesign, but inspectable (used directly by
this package's own product proof, and available for a future debug
surface).

Configuring a live deployment in future requires **only** supplying
`NEXT_PUBLIC_BOTM_MAP_DATA_URL` in Netlify's environment settings and
rebuilding once -- no further code change.

## Systemd preparation (not installed)

`deploy/systemd/botm-publication.service` is a repo-controlled,
long-running unit (unlike the `oneshot` collector,
`deploy/systemd/botm-unattended.service`) for the publication service --
same restricted `botm` service user, same `WorkingDirectory=/opt/
band-on-the-map`, `Restart=on-failure`, no root, logs via `journalctl`.
It is **not** installed, enabled, or started by this package.

## HTTPS boundary

The eventual browser-facing endpoint **must** be served over HTTPS. This
package does not solve DNS/TLS -- no server hostname is known yet. The
live deployment package must put `botm-publication.service` behind a
normal HTTPS reverse proxy (nginx/Caddy) on the same host before
`NEXT_PUBLIC_BOTM_MAP_DATA_URL` is ever configured against it. A raw HTTP
DigitalOcean IP must never be the final production design.

## No GitHub write path

This bridge adds no GitHub personal access token, no deploy key with
write access, no automatic `git commit`/`git push`, no PR creation, and
no Netlify rebuild hook. Refreshing the data visitors see requires only
a new collection run overwriting the on-disk artifact the publication
service already reads -- never a Git operation of any kind.

## Product proof (post-build runtime refresh)

Proven directly, offline, in this package:

1. Built the app once with `NEXT_PUBLIC_BOTM_MAP_DATA_URL` pointed at a
   local publication-server instance serving a fixture deliberately
   different from the bundled artifact (2 markers / 3 listings vs. the
   bundled 13 markers / 361 listings).
2. Started the built app (`next start`, production mode -- the
   already-completed-build analog of a live Netlify deploy).
3. Loaded the page in a real browser: after hydration,
   `data-map-data-source="runtime"` and the rendered counts matched the
   runtime fixture exactly (2 venues / 3 listings) -- fresh data
   consumed **after** the build had already finished, with no rebuild.
4. Stopped the publication service (`net::ERR_CONNECTION_REFUSED`) and
   reloaded the **same already-built** page: `data-map-data-source`
   flipped to `"bundled"` and the rendered counts matched the bundled
   artifact exactly (13 venues / 361 listings) -- the map was never
   left blank.

No canonical production gig data was altered to run this proof --
step 1's fixture was a temporary, deliberately-distinct artifact used
only as the publication server's on-disk source for that local instance.
