# Every sync is a full GraphQL sweep, with no incremental sync

Each cycle (~2 min) the backend re-reads every Tracked PR from scratch, using GraphQL only. One roster query is followed by id-only searches, then `nodes(ids:)` detail batches of 50. A PR that closed simply stops appearing, so there is nothing to reconcile and no state to keep between sweeps. That fits the no-database design in ADR 0001.

GraphQL charges a connection nested in a list once per item of that list, so reading every PR's review-thread comments and review `onBehalfOf` in the detail batches would cost ~300 points per sweep. The detail batches leave them out. Two follow-up `nodes(ids:)` queries read them only for the PRs that need them: threads for PRs that have threads, and `onBehalfOf` for PRs that ask a team for review. Measured on 2026-10-15, a sweep of 258 PRs cost 45 points and took 42 s, about 1,350 points/h against a 5,000/h floor.

## Considered Options

- **REST per-PR fan-out**: rejected. It takes ~760 calls per sweep, about 23k/h, which is more than the 12.5k/h installation cap.
- **Incremental sync** (`updated:>` searches, ETags): rejected. ETags only work on REST GETs, not GraphQL POSTs. `updated:>` misses Check Status changes. It would also need stored state to merge into.
