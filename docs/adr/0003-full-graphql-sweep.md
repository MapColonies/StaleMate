# Every sync is a full GraphQL sweep, with no incremental sync

Each cycle (~2 min) the backend re-reads every Tracked PR from scratch, using GraphQL only. One roster query is followed by id-only searches, then `nodes(ids:)` detail batches of 50. A sweep costs ~20–25 points and ~30 s, about 750 points/h against a 5,000/h floor. A PR that closed simply stops appearing, so there is nothing to reconcile and no state to keep between sweeps. That fits the no-database design in ADR 0001.

## Considered Options

- **REST per-PR fan-out**: rejected. It takes ~760 calls per sweep, about 23k/h, which is more than the 12.5k/h installation cap.
- **Incremental sync** (`updated:>` searches, ETags): rejected. ETags only work on REST GETs, not GraphQL POSTs. `updated:>` misses Check Status changes. It would also need stored state to merge into.
