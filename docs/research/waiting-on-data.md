# Which GitHub data reveals Waiting On

Research for [#3](https://github.com/MapColonies/StaleMate/issues/3), part of map [#1](https://github.com/MapColonies/StaleMate/issues/1). Terms (**Waiting On**, **Waiting Time**, **Review Status**, **Check Status**) are as defined in [`CONTEXT.md`](../../CONTEXT.md).

This document lists facts and pitfalls only. It does **not** decide how Waiting On is derived; that is for the follow-up grilling ticket ([#4](https://github.com/MapColonies/StaleMate/issues/4)).

## Method and sources

- **Schema.** GitHub's public GraphQL schema SDL, `https://docs.github.com/public/fpt/schema.docs.graphql`, downloaded 2026-10-12. Field descriptions quoted below come from it. It is cited as **[SDL]**.
- **REST and permission docs** on docs.github.com, cited inline:
  - [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps) **[PERMS]**
  - [Issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types) **[EVENTS]**
  - [Review requests](https://docs.github.com/en/rest/pulls/review-requests) **[REVREQ]**
  - [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) **[PROT]**
  - [About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) **[CO]**
  - [Pull request reviews reference](https://docs.github.com/en/pull-requests/reference/pull-request-reviews) **[REVREF]**
  - [Managing code review settings for your team](https://docs.github.com/en/organizations/organizing-members-into-teams/managing-code-review-settings-for-your-team) **[TEAMREV]**
  - [Requesting a pull request review](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/requesting-a-pull-request-review) **[REQ]**
- **Live checks.** I ran read-only `gh api graphql` and `gh api` calls against open MapColonies PRs on 2026-10-12 and cite each result as **[OBS: repo#n]**. These calls used a **user token with WRITE (not admin) permission**, not an App installation token. Anything said about the App's view below is inferred from [PERMS], not observed.

## TL;DR

- **Who is asked right now:** `PullRequest.reviewRequests` (users, teams, bots, each with `asCodeOwner`). This is a snapshot with **no timestamp**. The "since when" comes from the newest matching `ReviewRequestedEvent.createdAt` in `timelineItems`.
- **What reviewers said:** `reviews` holds the full history. `latestReviews` / `latestOpinionatedReviews` hold the newest review per user. Use `submittedAt` for the time; `createdAt` is when the pending review was *started*. `PullRequestReview.commit` tells you whether a review is on the current `headRefOid`.
- **When the author last pushed:** **there is no reliable push timestamp for ordinary pushes.** `Commit.pushedDate` is deprecated and removed. `committedDate` and `authoredDate` are git metadata. Only force pushes get a timestamped event (`HeadRefForcePushedEvent`). This is the single biggest gap for Waiting Time.
- **Author replies:** a reply inside a review thread is stored as a COMMENTED *review by the author*. REST `/reviews` lists these. GraphQL `timelineItems` and `latestReviews` don't, and there the replies only show up through `reviewThreads.comments`.
- **Thread resolution:** `reviewThreads.isResolved` / `resolvedBy`, GraphQL-only, with **no timestamp** and no timeline event.
- **Draft:** `isDraft`, plus `ReadyForReviewEvent` / `ConvertToDraftEvent` (both timestamped).
- **`reviewDecision`** is GraphQL-only, has no timestamp, and **behaved inconsistently** in live data (null despite approvals and a review ruleset). Treat it as a hint.
- **Merge requirements:** a non-admin can read them through `Ref.refUpdateRule` (classic branch protection) **and** `Ref.rules` (rulesets, including org-level). `Ref.branchProtectionRule` and REST `/protection` need **Administration** permission. MapColonies repos use **both** mechanisms.
- **Check Status:** `statusCheckRollup` on the head commit. Its `state` covers all checks, not just required ones. Per-context `isRequired(pullRequestNumber:)` is available. The rollup is `null` when the commit has no checks.
- **Mergeability:** `mergeable` / `mergeStateStatus` are computed lazily. The first read often returns `UNKNOWN`, and `BLOCKED` doesn't say why.
- **`timelineItems.totalCount` ignores the `itemTypes` filter.** Count nodes, never `totalCount`.

## Signal by signal

Legend: **TS** means the signal carries a timestamp. **GQL** and **REST** say where the signal is available.

### 1. Review requests, re-requests, removals

| Need | Field / event | TS | GQL | REST |
|---|---|---|---|---|
| Who is currently requested | `PullRequest.reviewRequests { asCodeOwner requestedReviewer }` | **No** | Yes | `GET /pulls/{n}/requested_reviewers` → `{users, teams}`, also `requested_reviewers` / `requested_teams` on the PR object |
| When a request was made | `timelineItems(itemTypes: REVIEW_REQUESTED_EVENT)` → `ReviewRequestedEvent { createdAt actor requestedReviewer }` | Yes | Yes | Timeline event `review_requested` (`created_at`, `requested_reviewer`, `review_requester`, plus `requested_team`) [EVENTS] |
| When a request was withdrawn | `ReviewRequestRemovedEvent { createdAt actor requestedReviewer }` | Yes | Yes | `review_request_removed` |

Facts:

- `RequestedReviewer` is a union: `Bot | EnterpriseTeam | Mannequin | Team | User` [SDL]. Queries need fragments for each type that matters, at least `User`, `Team` and `Bot`.
- "Once a requested reviewer submits a review, they are no longer considered a requested reviewer" [REVREQ]. Any submitted review clears the request, including a COMMENTED one.
- **Re-request** is a new `ReviewRequestedEvent` for the same person. The person reappears in `reviewRequests`, but their earlier review **stays** in `latestReviews` until they review again. [OBS: site-values#317] shows APPROVED at 13:36, then a re-request from the author the next day at 06:14, then APPROVED again at 07:35. During that window the reviewer was both "requested" and "latest = APPROVED".
- `ReviewRequest.asCodeOwner` says whether CODEOWNERS triggered the request [SDL].
- **Team requests:**
  - With team auto-assignment on, "the team is removed as a reviewer and a specified subset of team members are assigned in the team's place". When code owner review is *required*, "the team request cannot be removed and so the individual request will appear in addition" [TEAMREV], [REVREF].
  - A review made for a team is tagged `PullRequestReview.onBehalfOf` [SDL].
  - Expanding a Team into people needs the org **Members: read** permission (`GET /orgs/{org}/teams/{slug}/members`) [PERMS].
  - **Unverified:** whether a team request is cleared when one member reviews. No team requests showed up in the MapColonies PRs I sampled.
- **Reviewers who were never requested** are common: [OBS: dem-heights#62] has two approvals from people who were never requested, while the person who *was* requested hasn't reviewed. `reviewRequests` alone misses them.
- Requests made by automation such as CODEOWNERS have an `actor`, which may be the author or a bot; I didn't verify this.

### 2. Reviews and their states

| Need | Field | TS | GQL | REST |
|---|---|---|---|---|
| Full history | `PullRequest.reviews(states:, author:)`, also the `PULL_REQUEST_REVIEW` timeline item | `submittedAt`, `createdAt` | Yes | `GET /pulls/{n}/reviews` (`submitted_at`, `state`, `commit_id`). Timeline `reviewed` event has `submitted_at` and **no `created_at`** [EVENTS] |
| Newest per user (excluding pending) | `latestReviews` | same | Yes | No (derive from the list) |
| Newest "opinionated" per user | `latestOpinionatedReviews(writersOnly:)` | same | Yes | No |
| Which head the review saw | `PullRequestReview.commit { oid }`, compare with `PullRequest.headRefOid` | — | Yes | `commit_id` |

Facts:

- `PullRequestReviewState` is `APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING` [SDL].
- **`createdAt` vs `submittedAt`:** `submittedAt` is "when the Pull Request Review was submitted". `createdAt` is the object creation time, which is when the reviewer *started* a pending review. They can be minutes apart: 08:24:52 vs 08:28:00 in [OBS: polygon-parts-worker#107]. `createdAt` can even be 1 s *after* `submittedAt` ([OBS: opa-la#160]). Use `submittedAt`.
- `latestReviews` is described as "latest reviews per user … that are not also pending review" [SDL]. The description doesn't exclude COMMENTED. Whether a later COMMENTED review hides an earlier CHANGES_REQUESTED there is **unverified**.
- `latestOpinionatedReviews` is described only as "latest reviews per user" [SDL]. The name and GitHub's UI suggest it ignores COMMENTED, but **the schema doesn't say so**, so verify this before relying on it. It takes `writersOnly: Boolean` ("only return reviews from user who have write access").
- A review left by an admin with **Request changes** blocks merge until that person approves or the review is dismissed [PROT].
- A review's `commit` is the head at review time. Comparing it with `headRefOid` shows whether a review predates the latest commits, even in repos that don't dismiss stale reviews.

### 3. Dismissals and stale approvals

| Need | Field / event | TS | GQL | REST |
|---|---|---|---|---|
| A review was dismissed | `ReviewDismissedEvent { createdAt actor previousReviewState review dismissalMessage pullRequestCommit }` | Yes | Yes | Timeline `review_dismissed` (`created_at`, `dismissed_review`) |
| Current state of that review | `PullRequestReview.state == DISMISSED` | — | Yes | `state: "DISMISSED"` |

Facts:

- `ReviewDismissedEvent.pullRequestCommit` is described as "the commit which caused the review to become stale" [SDL]. It is presumably null for a manual dismissal; I didn't observe one.
- Stale dismissal is configurable. Classic protection uses `dismissesStaleReviews`, which needs admin to read. Rulesets use `PullRequestParameters.dismissStaleReviewsOnPush`, which is readable (see §9).
- Per [PROT], approvals are dismissed when "a contributor pushes new changes… or clicks **Update branch**, or because a related pull request is merged into the target branch". With these settings, approvals "will be dismissed as stale if the merge base introduces new changes". **A dismissal can happen without the author doing anything.**
- `requireLastPushApproval` ("the most recent reviewable push must be approved by someone other than the person who pushed it") does **not** dismiss reviews. Instead the PR silently needs another approval [PROT]. [OBS: dem-heights#58] has this enabled through a ruleset.
- No `ReviewDismissedEvent` appeared in the ~40 recently updated org PRs I sampled.

### 4. Pushes and commits after a review

| Need | Field / event | TS | GQL | REST |
|---|---|---|---|---|
| Commits in the PR | `PULL_REQUEST_COMMIT` timeline item → `PullRequestCommit { commit { oid authoredDate committedDate } }` | Git metadata only | Yes | Timeline `committed` event: **no `created_at`** [EVENTS], [OBS: site-values#317] |
| Force push | `HeadRefForcePushedEvent { createdAt actor beforeCommit afterCommit }` | Yes | Yes | `head_ref_force_pushed` |
| Push time | `Commit.pushedDate`: **deprecated**, "no longer supported. Removal on 2023-07-01" [SDL] | — | — | — |
| Pusher | `CheckSuite.push { pusher previousSha nextSha }`. The `Push` type has **no timestamp** [SDL] | No | Yes | — |
| Head SHA | `PullRequest.headRefOid` | — | Yes | `head.sha` |

Facts:

- **No first-class "pushed at" exists for normal pushes.** `committedDate` and `authoredDate` are set by the committer's machine. They can predate the PR: [OBS: 3d-ops-trigger#20] was opened 10-07 with commits dated 09-28. A rebase rewrites `committedDate`. A later push of an old local commit looks "old".
- Possible proxies, none authoritative:
  - `HeadRefForcePushedEvent.createdAt`, for force pushes only.
  - `CheckSuite.createdAt` on the head commit (REST `GET /commits/{sha}/check-suites`, Checks: read). This exists only if some App runs CI.
    - In [OBS: 3d-ops-trigger#20] the head was committed at 09:51:23. Its five suites were created at 09:53:47–51, which matches the push (PR `updatedAt` was 09:53:58), not the commit.
    - **A suite is created when the SHA is first pushed anywhere**, which isn't necessarily the push onto this PR. In [OBS: dem-heights#58] the head SHA got suites at 11:31:06 when it was pushed to a branch. It was only force-pushed onto the PR branch at 11:45:35 (`HeadRefForcePushedEvent`), and one more `github-actions` suite appeared at 11:45:39.
  - The newest `committedDate`.
- Pushes by GitHub itself (Update branch, merge-base changes) also change the head and can dismiss approvals (§3).

### 5. Author comments and replies

| Need | Field | TS | GQL | REST |
|---|---|---|---|---|
| Conversation comments | `ISSUE_COMMENT` timeline item → `IssueComment { author createdAt }` | Yes | Yes | Timeline `commented` (`created_at`), or `GET /issues/{n}/comments` |
| Inline review comments and replies | `PullRequestReviewComment { author createdAt publishedAt replyTo pullRequestReview outdated }` through `reviewThreads.comments` or `reviews.comments` | Yes | Yes | `GET /pulls/{n}/comments` (`in_reply_to_id`) |

Facts:

- **Inline replies are not standalone timeline items.** Every inline comment belongs to a `pullRequestReview` [SDL]. When the PR author replies inline, GitHub records **one COMMENTED review per reply, authored by the PR author**.
- **REST and GraphQL disagree on whether those author reviews exist** [OBS: polygon-parts-worker#107]:
  - REST `GET /pulls/107/reviews` returns four `COMMENTED` reviews by the author `roicohen326`, one per reply, at 10-08 11:33 and 10-12 07:57.
  - GraphQL `timelineItems(PULL_REQUEST_REVIEW)` and `latestReviews` for the same PR return **only** the reviewer's three reviews.
  - In GraphQL, the author's replies are visible **only** through `reviewThreads.comments`. There, each thread's last comment is by the author, with `createdAt`.
  - I didn't check whether the GraphQL `reviews` connection includes them; the GraphQL budget ran out (see pitfall 6).
- Consequence: with REST, author replies have to be filtered out of "reviews". With GraphQL, "the author replied to the review" has to be read from thread comments.
- Bot and automation noise is heavy in conversation comments: `github-actions` and `mapcolonies-devops` comment on most PRs [OBS: site-values#317, 3d-ops-trigger#20, developer-portal#174]. `author.__typename == "Bot"` catches GitHub Apps but not machine *users* such as `mapcolonies-devops`, which is the case CONTEXT.md's "configured logins" covers.

### 6. Review-thread resolution

| Need | Field | TS | GQL | REST |
|---|---|---|---|---|
| Open or resolved | `PullRequest.reviewThreads { isResolved isOutdated resolvedBy isCollapsed }` | **No** | Yes | **No.** REST review comments carry no resolution state |
| Last activity in a thread | `reviewThreads.comments(last: 1) { createdAt author }` | Yes | Yes | Via comments |

Facts:

- `PullRequestReviewThread` has no `createdAt`, `resolvedAt` or `updatedAt`, and `PullRequestTimelineItemsItemType` has no resolve or unresolve event [SDL]. **When a thread was resolved can't be known.** Only the current state is available.
- Unresolved threads can block merging when `requiresConversationResolution` (classic) or `requiredReviewThreadResolution` (ruleset) is on. [OBS: dem-heights#62] shows `mergeStateStatus: BLOCKED` with two approvals and one unresolved thread.
- `isOutdated` means the code under the thread changed. It doesn't mean resolved.

### 7. Draft and ready for review

| Need | Field / event | TS | GQL | REST |
|---|---|---|---|---|
| Is draft now | `PullRequest.isDraft` | — | Yes | `draft` |
| Became ready | `ReadyForReviewEvent { createdAt actor }` | Yes | Yes | `ready_for_review` |
| Went back to draft | `ConvertToDraftEvent { createdAt actor }` | Yes | Yes | `convert_to_draft` |

Facts:

- A PR opened as ready has **no** `ReadyForReviewEvent`. Fall back to `createdAt`, or `publishedAt`, which I didn't check.
- `ConvertedFromDraftEvent` is a **Projects/issue** event, not the PR one [SDL].
- Code owners "are not automatically requested to review draft pull requests". Marking the PR ready notifies them [CO]. A draft PR therefore often has empty `reviewRequests`.
- `MergeStateStatus.DRAFT` is deprecated; use `isDraft` [SDL].

### 8. `reviewDecision`

- `PullRequest.reviewDecision: PullRequestReviewDecision` (nullable). Values are `APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED`. Description: "The current status of this pull request with respect to code review" [SDL]. **No timestamp.**
- **REST has no equivalent.** The REST PR object has no review decision field [OBS: dem-heights#62 REST keys].
- What I observed:
  - `null` with no reviews and no review rule [OBS: site-values#324, basemap-management#1, where the ruleset requires 0 approvals].
  - Non-null `CHANGES_REQUESTED` / `APPROVED` on bases with **no visible review rule** once opinionated reviews exist [OBS: site-values#318, yahalom-app#954].
  - `REVIEW_REQUIRED` with **zero** requested reviewers and zero reviews [OBS: 3d-ops-trigger#20]. Approval is needed, but nobody has been asked.
  - **`null` despite two current-head APPROVED reviews and an active `PULL_REQUEST` ruleset** (1 approval, code-owner review) [OBS: dem-heights#62]. A sibling PR on the same repo and base returns `APPROVED` [OBS: dem-heights#58]. I can't explain the difference from the data. **Don't treat `reviewDecision` as the source of truth for Review Status.**
- `APPROVED` does not mean mergeable: [OBS: developer-portal#174] is `APPROVED` with `mergeStateStatus: BLOCKED`.

### 9. Required approvals, CODEOWNERS, branch protection: what a read-only App can see

Two independent mechanisms exist, and MapColonies uses both. Classic branch protection is on 3d-ops-trigger, polygon-parts-worker and developer-portal. Rulesets are on dem-heights, basemap-management and site-values [OBS].

| Source | Field / endpoint | Permission | Notes |
|---|---|---|---|
| Classic protection, full | `Ref.branchProtectionRule` / `Repository.branchProtectionRules`; REST `GET /branches/{b}/protection[/required_pull_request_reviews]` | **Administration: read** [PERMS] | Returned `null` to a WRITE user [OBS: 3d-ops-trigger master] |
| Classic protection, non-admin view | `Ref.refUpdateRule { requiredApprovingReviewCount requiresCodeOwnerReviews requiresConversationResolution requiredStatusCheckContexts }`, described as "Branch protection rules that are viewable by non-admins" [SDL] | Repository read | **No `dismissesStaleReviews` / `requireLastPushApproval`.** Those are admin-only |
| Rulesets (repo and org) | `Ref.rules { type parameters { ... on PullRequestParameters { requiredApprovingReviewCount requireCodeOwnerReview requireLastPushApproval dismissStaleReviewsOnPush requiredReviewThreadResolution } } }`, described as "rules from active Repository and Organization rulesets that apply to this ref"; REST `GET /rules/branches/{branch}` | **Metadata: read** [PERMS] | REST returns only active rules; evaluate and disabled rulesets are excluded |
| CODEOWNERS file | `Repository.object(expression: "<base>:.github/CODEOWNERS")` (also root and `docs/`); REST contents | Contents: read | Parse it yourself. Rules are per base branch [CO] |
| Which requests came from CODEOWNERS | `ReviewRequest.asCodeOwner` | Pull requests: read | Only for **pending** requests |
| Required checks | `CheckRun.isRequired(pullRequestNumber:)`, `StatusContext.isRequired(...)`; `refUpdateRule.requiredStatusCheckContexts`; ruleset `REQUIRED_STATUS_CHECKS` | Checks / Commit statuses: read | |

Facts:

- Rules apply to the **base ref**. PRs against feature branches often have no rules at all [OBS: dem-heights#66, yahalom-app#958].
- Ruleset `type` values seen in MapColonies are `PULL_REQUEST`, `COPILOT_CODE_REVIEW`, `NON_FAST_FORWARD`, `DELETION` and `REQUIRED_LINEAR_HISTORY` [OBS]. `COPILOT_CODE_REVIEW` means Copilot (a Bot) may be auto-requested or leave reviews.
- Nothing in the API says which code owners a given PR *still* needs. Working that out means matching changed files against CODEOWNERS yourself, using `PullRequest.files` and Contents read.

### 10. Check Status: `statusCheckRollup`

| Need | Field | TS | GQL | REST |
|---|---|---|---|---|
| Combined state | `PullRequest.statusCheckRollup` ("for the PR's head ref") or `commits(last:1).nodes.commit.statusCheckRollup` → `state: StatusState` (`ERROR, EXPECTED, FAILURE, PENDING, SUCCESS`) | No | Yes | **No single rollup.** `GET /commits/{ref}/check-runs` (**Checks: read**) and `GET /commits/{ref}/status` (**Commit statuses: read**) separately [PERMS] |
| Individual contexts | `contexts` → union `CheckRun \| StatusContext` | `CheckRun.startedAt/completedAt`, `StatusContext.createdAt` | Yes | Same two endpoints |
| Counts | `contexts { checkRunCount checkRunCountsByState statusContextCount statusContextCountsByState }` | — | Yes | — |
| Required or not | `isRequired(pullRequestNumber:)` on both types | — | Yes | — |

Facts:

- `CheckRun.status` is `CheckStatusState` (`QUEUED, IN_PROGRESS, COMPLETED, WAITING, PENDING, REQUESTED`). `conclusion` is `CheckConclusionState` (`SUCCESS, FAILURE, NEUTRAL, CANCELLED, SKIPPED, TIMED_OUT, ACTION_REQUIRED, STALE, STARTUP_FAILURE`) [SDL]. Commit statuses use `StatusState`.
- The rollup `state` counts **all** checks, required or not. [OBS: 3d-ops-trigger#20] is `FAILURE` with four failing check runs, none of them required.
- `statusCheckRollup` is **`null`** when the head commit has no checks or statuses [OBS: yahalom-app#954].
- Checks are on the head commit. After a push the rollup restarts as `PENDING`.

### 11. Mergeability

- `mergeable: MergeableState` is `MERGEABLE | CONFLICTING | UNKNOWN` ("based on the existence of merge conflicts").
- `mergeStateStatus: MergeStateStatus` is `BEHIND | BLOCKED | CLEAN | DIRTY | HAS_HOOKS | UNKNOWN | UNSTABLE` (plus the deprecated `DRAFT`) [SDL].
- In REST these are `mergeable` (bool or null) and `mergeable_state` (a lowercase string such as `"blocked"`) [OBS: dem-heights#62].
- Both are computed in the background. **`UNKNOWN` is common on the first read** [OBS: yahalom-app#954]. A poller has to tolerate it and keep the previous value or re-read.
- `BLOCKED` gives no reason. It can mean missing approvals, a missing code-owner approval, unresolved threads or failing required checks [OBS: developer-portal#174, dem-heights#62].
- `BEHIND` appears only when "require branches to be up to date" is on.

## Cross-cutting pitfalls

1. **`timelineItems(itemTypes: …).totalCount` ignores the filter.** It returns the total for the whole timeline. Three differently filtered connections on the same PR all returned the same number in every one of 50 PRs [OBS: org-wide scan]. Count `nodes` and page with `pageInfo`.
2. **Page from the end.** `timelineItems(last: 100, …)` keeps the newest events if a PR is long. Each page holds at most 100 items. A `since: DateTime` filter also exists [SDL].
3. **Timestamps differ by type.** Events use `createdAt`, reviews use `submittedAt`, commits use `committedDate`/`authoredDate` (unreliable), and threads have none. Timelines from REST (`created_at` missing on `committed` and `reviewed`) and GraphQL need per-type handling.
4. **Pending reviews.** `PENDING` is a draft review that hasn't been submitted. It is shown only to its author in GitHub's UI; I didn't verify through the API what the App sees. Either way, the App should assume it can't tell that "a reviewer is mid-review".
5. **Some actors may be null** (deleted users show as "ghost"), and `Mannequin` appears in imported repos [SDL].
6. **Rate limits.** The example query below cost **2 points** per PR. A `search` returning 40 PRs with up to 100 timeline items each cost **40 points**, roughly 1 point per PR. During this research a buggy `gh api --paginate` loop used up the whole 5,000-point hourly GraphQL budget within a minute or two. (`--paginate` only advances when the cursor variable is named `$endCursor`, and I had named it `$after`.) `GET /rate_limit` kept reporting the stale value of about 4,300 remaining while calls already failed. A poller should read the `X-RateLimit-*` response headers or `rateLimit { cost remaining resetAt }` in each query, not trust a separate check.
7. **App permissions needed (all read).** For a read-only App that covers everything above:
   - **Pull requests** (PRs, reviews, requests, threads)
   - **Issues** (the REST issue timeline lists both Issues and Pull requests [PERMS])
   - **Contents** (commits, CODEOWNERS, branches)
   - **Checks** and **Commit statuses** (rollup contents)
   - **Metadata** (rulesets; always granted)
   - Org **Members** (team membership)

   **Administration** is not needed if `refUpdateRule` and `rules` are enough. It is also broader than "read-only" suggests.

## Example: everything for one PR in one GraphQL query

Validated against several MapColonies PRs; cost 2 points each.

```graphql
query PrWaitingOn($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id number url state isDraft createdAt updatedAt
      author { __typename login }
      baseRefName headRefOid
      reviewDecision mergeable mergeStateStatus

      # Who is *currently* requested (users, teams, bots); drops once they review.
      reviewRequests(first: 50) {
        nodes {
          asCodeOwner
          requestedReviewer {
            __typename
            ... on User { login }
            ... on Bot { login }
            ... on Team { slug combinedSlug }
            ... on Mannequin { login }
          }
        }
      }

      # Latest non-pending review per reviewer (includes COMMENTED).
      latestReviews(first: 50) {
        nodes {
          author { login } state submittedAt commit { oid }
          onBehalfOf(first: 5) { nodes { slug } }
        }
      }
      latestOpinionatedReviews(first: 50) {
        nodes { author { login } state submittedAt commit { oid } }
      }

      # Unresolved-thread snapshot (threads carry no timestamps themselves).
      reviewThreads(first: 100) {
        totalCount
        nodes {
          isResolved isOutdated resolvedBy { login }
          comments(last: 1) { nodes { author { login } createdAt } }
        }
      }

      # Events that move the ball; `last:` keeps the newest if truncated.
      timelineItems(last: 100, itemTypes: [
        REVIEW_REQUESTED_EVENT, REVIEW_REQUEST_REMOVED_EVENT,
        PULL_REQUEST_REVIEW, REVIEW_DISMISSED_EVENT,
        PULL_REQUEST_COMMIT, HEAD_REF_FORCE_PUSHED_EVENT,
        READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT,
        ISSUE_COMMENT, REOPENED_EVENT
      ]) {
        pageInfo { hasPreviousPage startCursor }   # totalCount is NOT filtered
        nodes {
          __typename
          ... on ReviewRequestedEvent {
            createdAt actor { login }
            requestedReviewer { __typename ... on User { login } ... on Bot { login } ... on Team { slug } }
          }
          ... on ReviewRequestRemovedEvent {
            createdAt actor { login }
            requestedReviewer { __typename ... on User { login } ... on Bot { login } ... on Team { slug } }
          }
          ... on PullRequestReview { author { login } state createdAt submittedAt commit { oid } }
          ... on ReviewDismissedEvent {
            createdAt actor { login } previousReviewState
            review { author { login } } pullRequestCommit { commit { oid } }
          }
          ... on PullRequestCommit { commit { oid committedDate authoredDate author { user { login } } } }
          ... on HeadRefForcePushedEvent { createdAt actor { login } afterCommit { oid } }
          ... on ReadyForReviewEvent { createdAt actor { login } }
          ... on ConvertToDraftEvent { createdAt actor { login } }
          ... on IssueComment { createdAt author { login } }
          ... on ReopenedEvent { createdAt actor { login } }
        }
      }

      # Check Status on the head commit.
      commits(last: 1) {
        nodes {
          commit {
            oid committedDate
            statusCheckRollup {
              state
              contexts(first: 100) {
                checkRunCount statusContextCount
                checkRunCountsByState { state count }
                statusContextCountsByState { state count }
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion startedAt completedAt isRequired(pullRequestNumber: $number) }
                  ... on StatusContext { context state createdAt isRequired(pullRequestNumber: $number) }
                }
              }
            }
          }
        }
      }

      # Merge requirements visible without Administration permission.
      baseRef {
        name
        refUpdateRule {
          pattern requiredApprovingReviewCount requiresCodeOwnerReviews
          requiresConversationResolution requiredStatusCheckContexts
        }
        rules(first: 50) {
          nodes {
            type
            parameters {
              __typename
              ... on PullRequestParameters {
                requiredApprovingReviewCount requireCodeOwnerReview requireLastPushApproval
                dismissStaleReviewsOnPush requiredReviewThreadResolution
              }
            }
          }
        }
      }
    }
  }
  rateLimit { cost remaining }
}
```

The `rules` and `refUpdateRule` parts depend only on the base branch. A poller can fetch them once per (repo, base) instead of once per PR.

## Open questions this research surfaced

- **Waiting Time after an author push** has no reliable timestamp. Should "author pushed" be based on CI start time, force-push events, newest commit date, or "first seen by the poller" (our own cache)? Note that "first seen" conflicts with the no-DB baseline after a restart.
- **`reviewDecision` disagrees with the rules** (dem-heights#62). Should StaleMate compute Review Status itself from reviews and rules, or show GitHub's value?
- **Required code owners still pending** can only be found by parsing CODEOWNERS against changed files. Is that in scope for v1?
- **Teams:** how should a `Team` review request count toward Waiting On (all members, nobody, or "the Team")? Does it clear when one member reviews? This needs a live test because no samples exist in the org.
- **Unrequested reviewers** (they reviewed but were never asked) and **`REVIEW_REQUIRED` with nobody requested**: who is Waiting On in each case?
- **Machine users** such as `mapcolonies-devops` aren't `Bot`-typed. Their comments and requests need the configured-logins list from CONTEXT.md.
- **Copilot code review** rulesets exist in the org. Should Copilot as a requested or reviewing Bot count toward Waiting On?

- **Author replies:** REST lists them as COMMENTED reviews by the author, but GraphQL `timelineItems` and `latestReviews` don't (§5). Which API family should be the source for "the author answered"?

## Not verified here

- How things look to an actual App installation token, as opposed to a WRITE user token.
- Behaviour of team review requests.
- Whether `latestOpinionatedReviews` excludes COMMENTED.
- Whether GraphQL `reviews` includes author-reply reviews.
- A `ReviewDismissedEvent` sample.
- What `PullRequest.publishedAt` contains for a PR that was opened as a draft.
