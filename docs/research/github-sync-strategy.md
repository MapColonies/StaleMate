# GitHub sync strategy and rate-limit budget

Research for [#2](https://github.com/MapColonies/StaleMate/issues/2), part of map [#1](https://github.com/MapColonies/StaleMate/issues/1). Baseline: [ADR 0001](../adr/0001-github-app-backend-poller.md). The backend is a read-only GitHub App installed on MapColonies and polls about every 2 minutes.

**Question:** how should the backend collect every **Tracked PR** for `@MapColonies/infra` while staying inside the App's rate limits?

Every claim below cites the doc it comes from. The numbers marked **measured** come from read-only `gh api` calls against MapColonies on 2026-10-12. Those calls used a user token, not an App installation token, so an installation token could see slightly different visibility and limits.

---

## 1. Scale today (measured)

| Thing | Count | How |
|---|---|---|
| Team Members of `infra` | 9 (no child teams) | `GET /orgs/MapColonies/teams/infra/members`; GraphQL `team.members(membership: ALL)` |
| Team Repos of `infra` | 32 total: 22 not archived, 10 archived. Permissions: 29 ADMIN, 1 MAINTAIN, 2 READ | `GET /orgs/MapColonies/teams/infra/repos` |
| Org repos | 394 (296 public + 98 private) | `GET /orgs/MapColonies` |
| Org members | 45 | `GET /orgs/MapColonies/members` |
| Open PRs in the 22 non-archived Team Repos | **147** | search `is:pr is:open (repo:… OR …)` |
| Open org PRs a Team Member authored, is assigned to, reviewed, or is directly requested on | **157** | one advanced search (see §3) |
| Union of both sets (unique PRs) | **254** | deduplicated by node id |
| All open PRs in the org (non-archived) | 1,725 | `is:pr is:open org:MapColonies archived:false` |

Things that matter for later tickets:

- The Team includes two service accounts, `mapcolonies-devops` and `mapcolonies-org`. Both are of type `User`, not `Bot`. `mapcolonies-devops` authors **113** of the open org PRs, which is most of the "authored by Team Member" set.
- Some Team Repos are archived (10) or have only READ access (`config-ui`, `elastic-alertmanager-connector`). The `/teams/{team}/repos` endpoint returns all of them, together with `permissions` and `role_name` ([Teams REST docs](https://docs.github.com/en/rest/teams/teams#list-team-repositories)).
- 10 open PRs request a review from the `MapColonies/infra` team itself. `review-requested:<member>` matches those PRs; `user-review-requested:<member>` does not (see §3).

## 2. Listing Team Repos and Team Members

- REST: `GET /orgs/{org}/teams/{team_slug}/repos` and `GET /orgs/{org}/teams/{team_slug}/members`. Both need the **Organization › Members: read** permission and both accept installation access tokens ([Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)).
- GraphQL can do both in a single query that costs **1 point** (measured):

  ```graphql
  organization(login: "MapColonies") {
    team(slug: "infra") {
      members(first: 100, membership: ALL) { nodes { login } }
      repositories(first: 100) { edges { permission node { nameWithOwner isArchived } } }
    }
  }
  ```

  `membership: ALL` also returns members of child teams. `infra` has no child teams today.

## 3. Finding org-wide PRs that involve Team Members (search)

### Qualifiers ([Searching issues and pull requests](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests))

| Inclusion Reason | Qualifier | Notes |
|---|---|---|
| Authored by a Team Member | `author:LOGIN` | |
| Team Member assigned | `assignee:LOGIN` | |
| Team Member reviewed | `reviewed-by:LOGIN` | |
| Team Member review requested | `user-review-requested:LOGIN` | Direct requests only. |
| | `review-requested:LOGIN` | Also matches PRs where a team the user belongs to was requested. A requested reviewer "drops out of results after they review" (the `reviewed-by` query covers that case). |
| | `team-review-requested:ORG/TEAM` | Requests made to the team itself. |
| Not useful | `involves:LOGIN` | Means author OR assignee OR mentions OR commenter. It does not include review requests, and it adds mention/comment noise. |
| Hygiene | `archived:false`, `is:pr`, `is:open`, `org:MapColonies` | |

### Boolean search lets one query cover everything

- Since March 2025, **advanced issue search** (`AND`/`OR` with parentheses) works over the API: REST takes `advanced_search=true` and GraphQL takes `type: ISSUE_ADVANCED` ([changelog 2025-03-06](https://github.blog/changelog/2025-03-06-github-issues-projects-api-support-for-issues-advanced-search-and-more/)). Parentheses can nest up to 5 levels deep ([filtering docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests)).
- **Trap:** in advanced mode, a space between repeated `repo:` / `org:` / `user:` qualifiers means **AND**, not OR (same changelog). Written that way, the Team Repos query returns 0 results (measured). Write it as `(repo:A OR repo:B …)`.
- The REST search docs list "no more than five AND/OR/NOT operators" and a 256-character limit that excludes qualifiers ([Search REST](https://docs.github.com/en/rest/search/search)). In practice, a 36-term `OR` of qualifiers ran fine in `ISSUE_ADVANCED` (measured). That fits the 256-char rule not counting qualifiers. Treat a validation error as a signal to split the query.
- **1,000-result cap per search** ([Search REST](https://docs.github.com/en/rest/search/search)). Today's numbers (147 and 157) are far below it. Log a warning if `issueCount` goes over about 800.

The two discovery queries (measured: each costs 1 GraphQL point per 100-result page and takes about 1.5 s):

```text
Q_REPOS:   is:pr is:open (repo:MapColonies/a OR repo:MapColonies/b OR …22 repos)
Q_MEMBERS: is:pr is:open org:MapColonies archived:false
           (author:m1 OR assignee:m1 OR reviewed-by:m1 OR user-review-requested:m1 OR … for each member)
```

### Search limits

- REST search: **30 requests/minute** for authenticated callers ([Search REST](https://docs.github.com/en/rest/search/search)).
- GraphQL `search` is billed in GraphQL points (`rateLimit.cost` = 1 per 100-result page, measured). Running about 50 GraphQL searches back to back did not move the REST `search` bucket in `GET /rate_limit` (measured). The GraphQL docs say nothing either way. Either way, 4 searches per sweep fit even the 30/min limit.

## 4. GraphQL vs REST: cost of one full sweep

### GraphQL: one PR fragment carries all the data

The schema (introspected) has these fields directly on `PullRequest`: `isDraft`, `reviewDecision`, `reviewRequests` (users **and** teams), `latestOpinionatedReviews` (latest review per user), `reviews`, `assignees`, `author { __typename }` (`Bot` vs `User`), `statusCheckRollup { state }` ("Check and Status rollup information for the PR's head ref"), and `timelineItems(itemTypes: …)` (review-requested events, commits, reviews, ready-for-review events; this is the input for Waiting Time).

The point formula: for each connection, assume it returns `first`/`last` items, add up the requests, divide by 100, and round. The minimum is 1. A call can touch at most 500,000 nodes, `first`/`last` must be 1–100, and any call that takes more than 10 s is killed with a 502/504 ([GraphQL rate & query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)).

Strategies measured against the real data set of 254 unique PRs:

| Strategy | Calls | Points | Wall time (sequential) |
|---|---|---|---|
| Search with the full fragment inline, 6 per-qualifier queries, 50/page | 10 | ~33 | ~60 s (5–8 s per page) |
| Same at 100/page without timeline | 8 | ~40 | ~37 s |
| One giant OR query with the full fragment, 100/page | 1 | n/a | **504 timeout** |
| **Two-phase:** id-only searches, then `nodes(ids:)` in batches of 50 with the full fragment (including timeline) | 7 + 6 | **~23** | **~30 s** |
| Two-phase with the 2 combined discovery queries (§3) | 4 + 6 | **~20** | ~25 s |

Two-phase wins on every count. Each detail call stays well inside the 10 s timeout. Search does deduplication for free: the per-qualifier runs returned 347 rows that collapsed to 254 PRs. Inclusion Reasons do not depend on which query found a PR. They are computed from the fetched fields (repo in Team Repos, `author`, `assignees`, `reviewRequests`, reviews).

### REST would blow the budget

REST spreads the same data over separate endpoints: `pulls` (which includes requested reviewers and assignees), `pulls/{n}/reviews`, `commits/{sha}/check-runs`, and `commits/{sha}/status`. That is about 3 calls per PR, so 254 PRs × 3 ≈ **760 calls per sweep**, or ≈ **23,000 per hour** at 2-minute polling. The REST installation cap is 12,500/h ([REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). ETags could recover part of that (next section), at a real cost in complexity.

## 5. Incremental sync vs full sweep

- **Conditional requests:** REST `GET`s return `etag`/`last-modified`. An authorized `If-None-Match` request that gets a `304` **does not count** against the primary limit ([REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)). That only applies to REST. GraphQL is a single `POST` endpoint, and the same page says conditional requests on unsafe methods (POST and the like) are not supported.
- **`updated:>` incremental search:** this is risky for this product. A PR's `updatedAt` is not documented to change when CI finishes or a status is posted, because checks attach to the commit and not the PR. A cycle that only looks at changed PRs could miss a Check Status change. A dropped `updated:>` window would also silently drop PRs, and there is no database to repair the gap from.
- **Verdict:** **full sweep every cycle.** About 20 points per sweep is cheap enough that incremental sync buys nothing worth its complexity. Each sweep replaces the cache snapshot atomically, which also makes closed and merged PRs disappear without extra logic.

## 6. Installation rate limits and the 2-minute budget

- **REST primary:** 5,000 req/h per installation, plus 50/h for each repo beyond 20 and 50/h for each org user beyond 20, capped at **12,500/h** outside GHEC (15,000/h on GHEC) ([REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
- **GraphQL primary:** 5,000 points/h per installation, with the same 12,500 cap outside GHEC (10,000/h on GHEC per the GraphQL page) ([GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)).
- MapColonies has 394 repos and 45 users. An install on **all repositories** therefore hits the **12,500/h** cap. Even the 5,000 floor is plenty.
- **Secondary limits:** at most 100 concurrent requests, at most 2,000 GraphQL points/min, and at most 60 s of GraphQL CPU time per 60 s of wall time. GitHub's advice is to make requests serially through a queue and not to fan out in parallel ([GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api), [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)). A serial sweep cannot exceed the CPU rule. A parallel `nodes()` fan-out could.
- Timeouts (502/504) "can add extra point deductions" for the next hour (GraphQL limits page), which is another reason to keep pages small.

**Budget at a 2-minute interval:**

| Load | Sweeps/h | Points/h (at ~20–25 per sweep) | Share of 5,000 floor |
|---|---|---|---|
| Scheduled poll | 30 | ~750 | 15% |
| Plus "Refresh now", worst case (one global refresh per 30 s, coalesced with in-flight sweeps) | +120 | +~3,000 | ~75% total |
| Growth headroom: 4× today's PR count | 30 | ~3,000 | 60% |

Read `rateLimit { cost remaining resetAt }` on every call. When `remaining` drops below about 10% of `limit`, stretch the interval and switch off "Refresh now".

## 7. Minimal App permissions

| Permission | Level | Why |
|---|---|---|
| Repository › **Metadata** | read | Covers repo lookup (`GET /repos/{owner}/{repo}`). GitHub's App settings UI adds it automatically as soon as any repository permission is chosen. That comes from UI behaviour; the docs pages fetched here don't state it. |
| Repository › **Pull requests** | read | PRs, reviews, review requests, assignees, timeline, and search over PRs ([permissions page](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)). |
| Repository › **Checks** | read | Check runs that feed `statusCheckRollup`. |
| Repository › **Commit statuses** | read | Legacy statuses that feed `statusCheckRollup`. |
| Organization › **Members** | read | `teams/{team}/members` and `teams/{team}/repos`. |

Install it on **All repositories**. Search "will only contain the resources that you have access to" ([Search REST](https://docs.github.com/en/rest/search/search)), so a selected-repos install would silently miss Team-Member PRs in other repos. Subscribe to no webhook events, since webhooks cannot reach the VPN (ADR 0001).

---

## Recommendation

1. **API:** use GraphQL only. Never use REST per-PR fan-out.
2. **Each cycle (every ~2 min, serial):**
   1. **Roster** (1 pt): `organization.team(slug)` → `members(membership: ALL)` + `repositories { permission, isArchived }`.
   2. **Discovery** (id-only `search(type: ISSUE_ADVANCED, first: 100)`, paginate; about 4 pts):
      - `is:pr is:open (repo:MapColonies/<r1> OR repo:MapColonies/<r2> OR …)` over the Team Repos. Use parentheses and `OR`; a bare space means AND in advanced mode.
      - `is:pr is:open org:MapColonies archived:false (author:<m> OR assignee:<m> OR reviewed-by:<m> OR user-review-requested:<m> OR …)`. Use `review-requested:` instead if team requests should count (open question below).
      - Union the ids.
   3. **Detail** (~3 pts per 50): `nodes(ids: [...50])` with one `PullRequest` fragment: `number title url isDraft createdAt updatedAt author{login __typename} repository{nameWithOwner} assignees(first:10) reviewDecision reviewRequests(first:20){requestedReviewer{… on User{login} … on Team{slug}}} latestOpinionatedReviews(first:20){author{login} state submittedAt} statusCheckRollup{state} timelineItems(last:N, itemTypes:[…])`. The domain-rules ticket picks the exact timeline item types.
   4. Derive Inclusion Reasons, Review Status, Check Status, and Waiting On from that data. Swap the cache snapshot atomically.
3. **Cost:** about **20–25 GraphQL points and 25–30 s per sweep** today (254 PRs). That is about 750 pts/h scheduled against a floor of 5,000/h, or 12,500/h with an all-repos install. Make "Refresh now" a global cooldown of 30–60 s that joins an in-flight sweep. The worst case stays under 75% of the floor.
4. **Sync model:** full sweep every cycle, with no `updated:>` and no ETags. It is cheap, it is correct for Check Status changes, and it drops closed PRs naturally.
5. **Guards:** run requests serially; use page size 50 for detail calls (10 s timeout); log a warning when `issueCount` exceeds 800 (1,000 cap); back off when `rateLimit.remaining` is below 10%.
6. **Permissions:** Metadata, Pull requests, Checks, and Commit statuses (all repository, read) plus Members (organization, read), installed on **all repositories**.

### Open questions surfaced

- **Team review requests:** should a review request to the team `@MapColonies/infra` count as "Team Member review requested" (Inclusion Reason) and put the team, or every member, in Waiting On? 10 open PRs have one today.
- **Which repos count as Team Repos:** should archived ones (10) and READ-only ones (2) be included? Recommendation: exclude archived. READ-only is a product call.
- **Service accounts in the Team:** `mapcolonies-devops` (113 open authored PRs) and `mapcolonies-org` are `User`-typed Team Members. Should they go in the configured Bot logins by default and be dropped from the "I am…" Viewer list?
- **Old PRs:** the org has 1,725 open PRs and many Team Repo PRs are likely old bot bumps. Does v1 need an age cutoff, or does the Bot toggle cover it?
