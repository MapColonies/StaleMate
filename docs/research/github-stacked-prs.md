# GitHub native Stacked PRs: API, merge rules, dashboard presentation

Researched 2026-10-26. Read-only: only GET REST calls and GraphQL queries/introspection were run. Nothing was created, modified or commented on.
Token used: `gh` OAuth token, scopes `gist, read:org, repo` (`gh auth status`). `gh stack` extension v0.1.0 installed locally; `gh` 2.94.0.

Source tags: **[live]** = command run against the live API; **[docs]** = official GitHub docs/changelog (URL given); **[tool]** = third-party tool docs; **[unverified]** = could not confirm.

## 1. API surface and semantics

### 1.1 Status

- Public preview: 2026-07-30. [docs] https://github.blog/changelog/2026-07-30-stacked-pull-requests-are-now-in-public-preview/
- Generally available: 2026-10-06, all github.com plans; GHES "an upcoming release". [docs] https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/
- The API docs pages do not state a preview/GA flag for the API surface itself (https://docs.github.com/en/pull-requests/reference/stacked-pull-requests-apis-and-webhooks). In practice the GraphQL fields and REST `stack` object work with no preview header or special media type. [live] `gh api repos/MapColonies/jobnik/pulls/65` returned `stack` with default headers (`X-Github-Api-Version-Selected: 2022-11-28`).
- The REST Stacks endpoint docs use example API version `2026-03-10` (https://docs.github.com/en/rest/pulls/stacks). Whether the `stack` object on the pull request resource requires that version: [unverified] (it appeared under 2022-11-28 live).

### 1.2 GraphQL (read-only, no mutations)

Introspected with `gh api graphql -f query='{__type(name:"<T>"){...}}'`. [live]

- `PullRequest.stack: PullRequestStack` ("The stack this Pull Request belongs to, or null if it is not part of a stack").
- `PullRequest.stackEntry: PullRequestStackEntry` (null if not stacked).
- `PullRequestStack` ("A stack of PullRequests"): `id: ID!`, `number: Int!` ("uniquely identifying the stack within its repository"), `size: Int!` ("total number of pull requests in the stack"), `baseRefName: String!` ("The branch that the stack's pull requests target"), `entries(after, before, first, last): PullRequestStackEntryConnection!`.
- `PullRequestStackEntryConnection`: `edges`, `nodes`, `pageInfo`, `totalCount`.
- `PullRequestStackEntry`: `id`, `position: Int!` ("1 is the closest to the base branch, 2 is stacked on top of 1, etc."), `pullRequest: PullRequest` (nullable), `stack: PullRequestStack`.
- `AddedToStackEvent` and `RemovedFromStackEvent`: `actor`, `createdAt`, `id`, `pullRequest`, `stackId: BigInt`, `stackNumber: Int`. Both are members of `PullRequestTimelineItemsItemType` (`ADDED_TO_STACK_EVENT`, `REMOVED_FROM_STACK_EVENT`).
- No Mutation or Repository field contains "stack" (checked by listing `Mutation` and `Repository` field names). Docs agree: "No stack mutations exist" (apis-and-webhooks page).
- There is no `Repository.stacks` connection and no `PullRequestStackState`. Stack-level state (open/merged) must be derived from entries' PR states.

Live example, `MapColonies/jobnik` PR #65: [live]

```
gh api graphql -f query='{repository(owner:"MapColonies",name:"jobnik"){pullRequest(number:65){stack{id number size baseRefName entries(first:10){totalCount nodes{position pullRequest{number state isDraft baseRefName headRefName reviewDecision mergeStateStatus}}}} stackEntry{position} timelineItems(first:20,itemTypes:[ADDED_TO_STACK_EVENT,REMOVED_FROM_STACK_EVENT]){nodes{__typename ... on AddedToStackEvent{createdAt stackNumber stackId actor{login}}}}}}}'
```

Result: stack id `PRS_kwDOT-og-84AJ6nS`, number 68, size 4, baseRefName `master`; entries in ascending `position`: 1=#64 (base `master`), 2=#65 (base = #64's head), 3=#66, 4=#67; all OPEN, draft, `REVIEW_REQUIRED`, `BLOCKED`. One `AddedToStackEvent` on #65 at 2026-10-26T08:29:20Z, `stackNumber` 68.
Note: **68 is a stack number, not a PR number.** `GET /repos/MapColonies/jobnik/pulls/68` returns 404. Stack numbers appear to share the repo's issue/PR number sequence (stack 68 follows PR 67) but this is inferred, not documented.

### 1.3 REST

- `stack` object on pull request resources: `{ "base": {"ref","sha"}, "id", "number", "position", "size" }`, `null` when not stacked. [live] `gh api repos/MapColonies/jobnik/pulls/65` gave `{"base":{"ref":"master","sha":"ba0e2a9..."},"id":2599378,"number":68,"position":2,"size":4}`. Docs describe it as number, size, position and base branch (https://docs.github.com/en/pull-requests/tutorials/roll-out-stacked-prs).
- Stacks API: `GET /repos/{o}/{r}/stacks` (optional `pull_request` filter, pagination), `POST .../stacks` (create), `GET .../stacks/{stack_number}`, `POST .../stacks/{n}/add`, `POST .../stacks/{n}/unstack` (https://docs.github.com/en/rest/pulls/stacks). Stack fields: `id, number, node_id, url, base.ref, open, created_at, pull_requests[]`. The doc does not state `pull_requests` order for List/Get; create/add inputs are bottom to top. I did not call these endpoints.
- Webhooks: `pull_request` payload carries `stack` (target branch of the stack). A `stacked` action fires when a PR joins a stack (GA changelog; apis-and-webhooks page does not list actions).
- Timeline: REST issue-timeline event names for stacks: [unverified] (my REST timeline call failed to parse; GraphQL events above are verified).

### 1.4 Permissions and tokens

- Read access worked with a classic OAuth token with `repo` scope (`X-Accepted-Oauth-Scopes: repo` on the PR endpoint). [live]
- Fine-grained token permission and GitHub App permission needed to read `stack`/`stackEntry`: **[unverified]**. The Stacks REST page and the APIs page state no permissions. Because `stack` rides on the ordinary pull request resource/object, the likely requirement is the same as reading pull requests (Pull requests: read), but this was not tested.

### 1.5 Ordering, shrink, retarget, renumber

- Entries are returned ascending by `position` (1 = closest to base). [live] jobnik #65 query.
- Docs: when a lower PR merges, "Merged PRs leave the stack, so it shrinks with each merge", and "The next unmerged PR is automatically rebased to target the stack base directly. It moves to the bottom of the stack" (https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests). A mid-stack merge: PRs above "stay open and automatically re-target the stack's base branch" (about-stacked-prs). Bases retarget: documented. Positions renumber (so the next PR becomes position 1): documented ("moves to the bottom").
- Live observation that qualifies the "shrinks" claim: fully merged stacks keep every entry. `MapColonies/jobnik` stack 4 has `size: 13`, `entries.totalCount: 13`, all 13 PRs MERGED with positions 1..13 intact; stack 39 has size 7 all MERGED, positions 1..7. `github/gh-stack` stacks 577, 580, 530 likewise keep original sizes/positions on merged PRs. [live] So for a completed stack, `size` and `position` are historical, not shrunk. Note jobnik #14 (merged) still reports `baseRefName` `migration/11-knip`, i.e. not the trunk.
- I could not find a partially merged stack (some MERGED, some OPEN) in sampled repos (100 recent `gh-stack` PRs, 30 jobnik PRs), so what a still-open upper PR reports after a lower merge (renumbered `position`, reduced `size`, changed `baseRefName`, an event on the timeline) is **[unverified live]**. Only the docs describe it. Whether `RemovedFromStackEvent` fires on merge is unverified.
- `PullRequestStackEntry.pullRequest` is nullable, so a consumer must tolerate null entries (reason not documented; possibly permissions/visibility, unverified).
- Stack closes automatically once all PRs merge; later `gh stack submit` branches start a new stack with the same base (roll-out-stacked-prs page).
- Stack base branch deleted: stack retargeted automatically (GA changelog).

## 2. Merge and review rules

All [docs] unless noted: merging page, about page, troubleshooting page (URLs above plus https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-stacked-pull-requests).

- Upper before lower: not possible. "pull requests must merge from the bottom up." Merging an upper PR merges every unmerged PR below it in one operation (so "merge the top PR" = merge the whole stack; "merge a mid-stack PR" = land the stack up to there). A PR can merge only when it and all PRs below meet merge requirements and history is linear.
- Approval/checks are **per PR**, but gating is **cumulative**: "All PRs below the target must be approved and have passing checks." Branch protection / CODEOWNERS / required reviews are enforced on every PR using the **bottom PR's base branch** (typically main) as the rule source, including PRs that do not target main. CI on `pull_request` targeting the default branch runs for every PR in the stack. Each PR "can be reviewed and iterated on independently".
- Rebase stack: keeps approvals for unchanged diffs even with "dismiss stale approvals". Pushing to a lower branch or trunk moving ahead breaks linear history and blocks merging until rebased.
- Closing a mid-stack PR "blocks all pull requests above it from being mergeable" (stack relationship preserved).
- Partial failure: PRs already merged stay merged; failed PR and above stay open.
- Merge queue: stacks are supported. All PRs are queued in order. Group may exceed max size by up to 50% to keep the stack together. If a PR is ejected, all PRs above it are ejected. GA changelog: stack lands "as one merge group", one merge commit per PR with the merge-commit method. Queue support was "rolling out progressively" at preview; whether it was complete at GA: the GA text and merging page are consistent on queue support.
- Auto-merge: **conflicting sources.** The merging page says "Auto-merge isn't supported for stacked pull requests"; the GA changelog says stacks can be set to auto-merge and that this is "rolling out over the next few weeks". Treat as in flux.
- Bypass: users who can bypass rules can merge the lowest unmerged PR (GA changelog).
- Merging via API requires the asynchronous stack merge endpoint; legacy merge endpoints/mutations cannot merge a stack (apis-and-webhooks page).
- Same repository only; no cross-fork stacks; branching (non-linear) stacks not supported.
- Whether draft PRs below block merging beyond the normal "draft cannot merge" rule: not documented. [unverified]

## 3. How tools present and sort stacks

### GitHub itself

- PR page: stack icon with layer number; merge box shows a "stack map" listing every PR and its status with navigation; header shows stack info persistently; Shift+J / Shift+K move between stack PRs; timeline shows added/removed events (about page; GA changelog). Each PR's diff shows only its own layer vs. the branch below it.
- PR list: GA changelog says stack info is "viewable from the pull requests list". The docs do not describe grouping, sort order, or any `stack:` search qualifier. Whether the list groups stacks or only decorates rows: **[unverified]** (no UI access in this environment; I did not use a browser).
- Pitfall explicitly documented: required reviews and checks apply per PR, so "review flow" differs; CI cost multiplies since every PR runs the default-branch workflows (roll-out page).

### Graphite

- Inbox default sections "Needs your review", "Approved", "Waiting for review"; sections are filter-based and customizable. In review, a "Show stack" button / `S` jumps within the stack, and the guide suggests starting from the bottom of the stack (https://graphite.com/docs/review-pull-requests via search result). Whether the inbox groups a stack into one row: **[unverified]** (docs pages I tried for the inbox returned 404; the search summary says no doc found on this).

### Reviewable

- Docs mention a "Reviewing stacks of dependent changes" tip: separate-commit review inside one PR, or `spr` stacks; Reviewable detects `spr` and links related reviews and updated review states (https://docs.reviewable.io/tips.html). Dashboard grouping of stacks: not documented there. [unverified]

### Sapling (`sl pr`) and ghstack

- Sapling docs call `sl pr` PRs "overlapping" and say they "can confuse reviewers using the GitHub PR UI"; reviewers are "strongly encouraged to use ReviewStack" (https://sapling-scm.com/docs/git/github).
- ghstack: one PR per commit, each PR targets its own `gh/<user>/N/base` branch, not main; "You will NOT be able to merge these commits using the normal GitHub UI"; landing via `ghstack land`; conflicts must be resolved per PR (https://github.com/ezyang/ghstack). That is, with these tools the GitHub PR UI shows only a PR's own diff against a synthetic base and the PR list shows unrelated-looking rows.

### Pitfalls reviewers hit (sourced)

- Upper PR cannot merge/land until lower ones are approved and green, so an approved upper PR can sit "ready" but blocked (merging page).
- A lower PR closed, rebased or failing checks makes all upper PRs unmergeable without any activity on them (troubleshooting page).
- Pushing to a lower branch breaks linearity for all above until "Rebase stack" (troubleshooting page). Unchanged-diff approvals survive Rebase stack; with plain force-push rebases outside that feature, whether approvals survive depends on the repo's dismiss-stale setting [unverified for stacks beyond the docs statement].
- Review order: tools suggest bottom-up (Graphite doc; GitHub position numbering).

## Implications for StaleMate

Not sourced facts; recommendations derived from the above and from CONTEXT.md vocabulary (Waiting On / Age / Urgency are per-PR).

1. Do (a) now: show a stack-position chip such as "2/4" from `stackEntry.position` + `stack.size`. It is cheap (two fields, no extra entries query) and meaningful. Treat `position`/`size` as current only while the stack is open; for fully merged stacks they are historical (live-observed), and for partial merges the live behavior is unverified, so do not treat them as stable identifiers. Use `stack.number` (+ repo) as the grouping key, not position.
2. Do (b) as a light, optional grouping: in a list, cluster rows by `stack.number`, ordered by `position` ascending (base first, matching GitHub's and Graphite's bottom-up review order), and allow per-row filters to still work. Do not collapse the stack into a single row by default, since approval/checks/reviewers are per PR and each PR's Waiting On can differ.
3. Do not do (c) (stack-level Age / Waiting On). Rules are per PR but merge gating is cumulative, so a stack-level number would hide who actually owes an action. Instead, add per-PR derived facts if wanted: "blocked by lower PR #N" (first lower entry not approved/green/merged) so an upper PR that is approved but waiting on a lower one is not flagged as stale or as waiting on its reviewers. Age must stay per PR; an upper PR's Age should not be reset or inherited from its stack, and its apparent staleness is expected and should not raise Urgency by itself.
4. Sorting: sort stacks by the actionable PR, not the oldest or newest member. Sensible default: place the stack at the rank of its lowest unmerged PR that needs the viewer's action (usually the bottom), and keep members contiguous in position order. If the list is sorted globally by Urgency/Age without grouping, show the chip so users can see order.
5. Data caveats before building: fetch `entries(first: N)` only if grouping is needed (otherwise the chip needs no extra query); handle `stack: null`, null `entries.nodes[].pullRequest`, and permission/visibility gaps; token/app permission for these fields is unverified, so test with StaleMate's real credential (GitHub App installation token or fine-grained token) before relying on it; and capture a recorded fixture of a partially merged stack once one exists (remember the fixture scrubbing rule for logins/ids).
