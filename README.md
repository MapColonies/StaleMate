# StaleMate

A dashboard that keeps a team from missing PRs: what is open, whose move it is, and how long it has been waiting.
The vocabulary is in [`CONTEXT.md`](./CONTEXT.md) and the decisions are in [`docs/adr`](./docs/adr).

## Layout

| Path               | Package             | What                                                                           |
| ------------------ | ------------------- | ------------------------------------------------------------------------------ |
| `apps/api`         | `stalemate-api`     | Sweeps the code host, derives every Tracked PR and serves the Snapshot.        |
| `apps/ui`          | `stalemate-ui`      | The dashboard. Talks to the API under `/api`.                                  |
| `packages/openapi` | `stalemate-openapi` | The contract between them, with its generated types committed in `index.d.ts`. |

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

Run the API with `pnpm --filter stalemate-api dev` and the UI with `pnpm --filter stalemate-ui dev`.
The UI's dev server proxies `/api` to `http://localhost:8080`; set `API_URL` to point it elsewhere.

The API reads its config offline from `apps/api/config`. Put local overrides, such as a `githubToken`, in
`apps/api/config/local.json`, which git ignores. By default it serves canned fixtures. To sweep GitHub locally with your own
token, set `"provider": "github"` there, or run it with `PROVIDER=github GITHUB_TOKEN=$(gh auth token)`.

The GitHub provider's tests replay a real sweep recorded in `apps/api/tests/fixtures/github/recording`. To record it again, run
`GITHUB_TOKEN=$(gh auth token) pnpm --filter stalemate-api record:github`; the script explains what it records and scrubs.

After changing `packages/openapi/openapi3.yaml`, regenerate its types with
`pnpm --filter stalemate-openapi generate:openapi-types`.
