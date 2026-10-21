# Every sync is a full GraphQL sweep, with no incremental sync

Each cycle (~2 min) the backend re-reads every Tracked PR from scratch, using GraphQL only. A sweep has two steps. Discovery runs one roster query, then searches that return each PR's id and `updatedAt` only. The read then fetches the discovered PRs in `nodes(ids:)` detail batches of 50. A PR that closed simply stops appearing, so there is nothing to reconcile and no state to keep between sweeps. That fits the no-database design in ADR 0001.

The provider offers discovery and the read as separate operations, so StaleMate, not the provider, chooses which discovered PRs to read. For now it reads every one.

GraphQL charges a connection nested in a list once per item of that list, so reading every PR's review-thread comments and review `onBehalfOf` in the detail batches would cost ~300 points per sweep. The detail batches leave them out. Two follow-up queries read them only for the PRs that need them: threads for PRs that have threads, and `onBehalfOf` for PRs that ask a team for review and have reviews. GitHub charges for the items a query asks for, not for those it gets, so each follow-up reads every PR under its own alias and asks for only as many threads or reviews as the detail batch counted, plus a few for any that turn up in between. Asking every PR for 100 threads cost ~9× as much.

Measured on 2026-10-18, a sweep of 260 PRs cost 31 points and took ~30 s, under 900 points/h against a 5,000/h floor. Of that, the detail batches cost 21 points and ~22 s, ~4–4.5 s per 50 PRs, which is spent reading the fields the domain needs and grows with the number of PRs. The searches cost 5 points and ~5 s, the threads 4 points and ~3 s. Each sweep logs this breakdown, one line for discovery (roster, search) and one for the read (details, threads, review teams).

## Considered Options

- **REST per-PR fan-out**: rejected. It takes ~760 calls per sweep, about 23k/h, which is more than the 12.5k/h installation cap.
- **Incremental sync** (`updated:>` searches, ETags): rejected. ETags only work on REST GETs, not GraphQL POSTs. `updated:>` misses Check Status changes. It would also need stored state to merge into.
