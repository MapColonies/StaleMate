# Sweeps re-read Tracked PRs by Idle Time tier

StaleMate is meant to cover the whole org: 1,758 open PRs in 357 repos on 2026-10-21, 71% untouched for 3+ months. Reading every one each ~2 min sweep would take ~3.5 min and ~6,000 GraphQL points/h, against a 5,000/h floor. So a sweep still discovers every Tracked PR, but reads the details of only those that may have changed. This supersedes the "full sweep, no state between sweeps" part of ADR 0003.

Each sweep reads:

- every PR not yet in the store (new);
- every PR whose `updatedAt` differs from the one stored with its last read (changed);
- every PR whose Tier says it is due, because its Tier's interval has passed since that PR was last read.

A PR's Tier comes from its Idle Time when the sweep starts:

| Tier | Idle Time                              | Details re-read |
| ---- | -------------------------------------- | --------------- |
| Hot  | under 10 Working Days                  | every sweep     |
| Warm | 10 to 60 Working Days (about 3 months) | every 15 min    |
| Cold | 60 Working Days or more                | every 60 min    |

The boundaries and intervals are config. The boundaries are in Working Days, like Idle Time itself, so the Cold boundary is 60 Working Days rather than 3 calendar months.

Idle Time ignores Bots, so a PR only Bots touch cools down like any idle PR. A Bot's change still moves `updatedAt`, so it gets one read. A PR no longer discovered is dropped. A Roster change re-derives every stored PR, read or not, since Waiting On and Inclusion Reasons depend on it.

The cost: a Warm or Cold PR's Check Status, and anything else that changes without moving `updatedAt`, can lag by up to its Tier's interval. Nobody is acting on those PRs, so that is accepted. The Snapshot's `readAt` keeps meaning when the last successful sweep started; each stored PR separately keeps when it was last read, which is what its Tier's interval counts from. After a restart the store is empty, so the first sweep reads every PR.

Estimated at org scale: ~500 Hot PRs a sweep plus Warm and Cold ones spread over their intervals, about 70 points a sweep and ~2,000 points/h.

## Considered Options

- **Full sweep every time** (ADR 0003): rejected at org scale, over the rate-limit floor and longer than the sweep interval.
- **Tiers by Age**: rejected. An old PR someone is actively working on would be read rarely.
- **Tiers by `updatedAt` alone**: rejected. Bots touch PRs constantly, so a PR only Renovate updates would stay Hot. `updatedAt` still triggers a read, but the tier follows Idle Time.
