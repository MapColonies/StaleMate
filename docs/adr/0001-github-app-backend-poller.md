# Backend reads GitHub as an org-installed GitHub App, polls, and caches in memory

Users never hand StaleMate a token. A read-only GitHub App installed on the MapColonies org gives the backend its own credentials; the backend polls GitHub (the cluster is VPN-only, so GitHub cannot deliver webhooks) and serves the frontend from an in-memory cache behind a cache abstraction, so a shared cache server can be added later without touching callers. There is no database: everything shown is rebuildable from GitHub, and per-Viewer preferences live in the browser.

## Considered Options

- **Browser-only with a personal token** — rejected: every page load would sweep many repos on one person's rate limit, and every Viewer needs a token.
- **Backend with a service account's personal token** — rejected: tied to an account and broader than read-only; kept only as a stopgap if App installation is delayed.
- **Webhooks** — impossible: GitHub cannot reach the VPN.
