# The API server serves the built web app on one origin

One `node:http` server owns both surfaces: `/healthz` answers at the root, `/api/*` is routed to the
API after the prefix is stripped, and every other path is served from `WEB_DIST` with an SPA
fallback to `index.html`, except paths that look like assets (`/assets/...` or a file extension),
which return 404 instead of the shell. Without `WEB_DIST` (development) all non-API requests go to
the API, and Vite serves the app and proxies `/api` to the server.

The prefix exists so the contract paths in `main.tsp` stay unchanged while the browser always calls
`/api`; a deploy then ships one container and one origin, with no CORS and no second web server.

**Considered options:** a separate static server or nginx in front of the API (another process,
another artifact, and CORS or proxy configuration to keep in sync); mounting the API under `/api`
inside the router (a public API change that would also diverge from the generated client's paths).

**Consequences:** static serving, path traversal protection, and the fallback are server code
covered by tests; the development and production difference is only who serves the shell; any
platform in front of the app must not strip `/api` before the server sees it.

**Source:** imported from [386#32](https://github.com/DK-2013/ai-for-developers-project-386/issues/32) — see `docs/UPSTREAM.md`.
