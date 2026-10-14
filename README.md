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
`apps/api/config/local.json`, which git ignores.

After changing `packages/openapi/openapi3.yaml`, regenerate its types with
`pnpm --filter stalemate-openapi generate:openapi-types`.
