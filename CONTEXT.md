# StaleMate

A dashboard that keeps each team in the org from missing PRs: what is open, whose move it is, and how long it has been waiting.

## Language

### Who

**Team**:
A GitHub Team in the org whose work StaleMate watches, e.g. `@MapColonies/infra`. StaleMate watches every Team except any configured out. A Team includes the members and repositories of its child Teams, as on GitHub.
_Avoid_: Group, squad

**Team Member**:
A person who belongs to the Team.
_Avoid_: User, developer

**Bot**:
A non-human PR author — a GitHub account of type Bot, or a login configured as one.
_Avoid_: Automation, app

**Viewer**:
The person looking at the dashboard, who has said which person they are: anyone in any Team, whichever Team they are looking at.
_Avoid_: User, me, current user

### What

**PR**:
A proposed change awaiting merge on a code host. A GitLab Merge Request is a PR.
_Avoid_: Merge request, MR, change request

**Stack**:
PRs in one repository that depend on each other in order, as GitHub's own Stacks group them: the first targets the repository's trunk and each later one builds on the one before. A PR belongs to at most one Stack. A Stack may include PRs that no Team tracks, or that were authored outside the Team. A PR with no Stack stands alone.
_Avoid_: Chain, train, series

**Stack Position**:
A PR's place among the PRs still in its Stack, counted from the first, shown as "2 of 4"; merged PRs leave the Stack, so the rest move down. Review Status, Waiting On, Age and Urgency stay the PR's own, whatever its Stack Position.
_Avoid_: Order, rank, level

**Held**:
An Approved, Passing PR that cannot merge yet because a PR below it in its Stack is not ready by the code host's own verdict: a draft, one whose review decision is not approved, or one whose checks are not green. A PR the code host asks no review of, or that has no checks, is not held up for it. A PR can merge only once every PR below it can, and merging it lands them too. Held is a hint beside the author's merge Move, never a Move of its own, and never changes Waiting On.
_Avoid_: Blocked, waiting on

**Team Repo**:
A live repository the Team is granted on GitHub, at any access level. Archived repositories are not Team Repos.
_Avoid_: Owned repo, project

**Tracked PR**:
A PR StaleMate shows for a Team: any PR in one of its Team Repos, or any PR in the org that one of its Team Members authored, is a requested reviewer on, has reviewed, or is assigned to, or that asks that Team itself for review. A PR can be tracked for several Teams; a PR no Team tracks is never shown. A PR in an archived repository is never a Tracked PR.
_Avoid_: Watched PR, relevant PR

**Snapshot**:
Every Tracked PR of every Team as StaleMate last read it from the code host, stamped with when the last successful sweep started. A Viewer always sees one Team's Tracked PRs from one Snapshot; there is no history. Each sweep finds every open Tracked PR, but re-reads long-idle PRs less often, by their Tier, so their details can be behind by up to their Tier's interval.
_Avoid_: Cache, sync result, data

**Out-of-date Snapshot**:
A Snapshot whose last attempt to read the code host failed, so the Viewer is warned that what they see may be behind.
_Avoid_: Stale data, stale snapshot

**Jira Ticket**:
A Jira issue a PR's title names by its key (e.g. MAPCO-1234), linked to Jira. Only the configured Jira projects' keys count. A PR may name several, or none, which is shown but changes nothing else.
_Avoid_: Jira link, issue, story

**Inclusion Reason**:
Why a PR is a Tracked PR (e.g. Team Repo, authored by Team Member, Team Member review requested, Team review requested). A PR can have several; they rank, strongest first: authored by Team Member, Team Member review requested, Team review requested, assigned to Team Member, reviewed by Team Member, Team Repo. The strongest is the one a PR is shown with, and it names the Viewer when the Team Member it means is them.
_Avoid_: Flag, tag, source

### Status

**Review Status**:
Where a PR stands with its reviewers as a whole: Draft, Awaiting Review, Changes Requested, Awaiting Re-review, or Approved. StaleMate judges it by the Team's own norm (one approval, nothing outstanding), not by the code host's verdict or the repo's merge rules. An approval stands through later commits until its reviewer gives another verdict or it is dismissed. Comments without a verdict, the author's own reviews and Bot reviews never move it.
_Avoid_: State, PR state, review decision

**Answered**:
A reviewer's request for changes that the PR's side has responded to since: every comment thread of that review has an author reply or is resolved (or, if it had no threads, the author commented on the PR), or new commits arrived, or the reviewer was asked to review again. Answered says nothing about agreeing — the author may have pushed back.
_Avoid_: Addressed, fixed, resolved

**Awaiting Re-review**:
The Review Status of a PR whose every outstanding request for changes is Answered, so the reviewers owe another look.
_Avoid_: Changes addressed, ready for review

**Check Status**:
The combined result of a PR's CI checks, leaving out the Excluded Checks: Passing, Failing (any check failed, errored, was cancelled, timed out or needs action), Pending, or None (no checks left).
_Avoid_: CI status, build status

**Excluded Check**:
A check that Check Status leaves out because it says nothing about whether the code works — by default the Jira validation, so a PR whose only failure is a missing Jira Ticket is Passing.
_Avoid_: Ignored check, skipped check

**Waiting On**:
The people or teams who owe the next move on a PR — the author, one or more reviewers, or both. Never empty: when no reviewer owes a move, the PR waits on its author. Never a Bot, except a Bot PR's own author, who stands wherever an author would owe a move, because no human owes it in their place.
_Avoid_: Turn, ball in court, blocker, assignee

**Move**:
What a person in Waiting On owes, and so why the PR is on them, which its Review Status alone may not say: an author on a PR Awaiting Re-review may still owe a fix to failing checks or a conflict. The author's are finish draft, merge, answer changes, reply, find reviewer, fix checks and resolve conflict; a reviewer's are review, re-review and reply. A person may owe several.
_Avoid_: Reason, action, task

**Age**:
How long a PR has been up for review, counted in Working Days from when it was first ready for review; time before that as a Draft does not count. The measure StaleMate exists to shrink.
_Avoid_: Lifetime, lead time, Waiting Time

**Idle Time**:
How long since a person last acted on a PR — opened it, pushed, reviewed, commented, asked for a review or marked it ready — counted in Working Days. Bot activity does not count.
_Avoid_: Waiting Time, staleness, inactivity

**Tier**:
How often StaleMate re-reads a Tracked PR's details, by its Idle Time: **Hot** (recently acted on) every sweep, **Warm** less often, **Cold** (idle for months) least often. The boundaries and intervals are set once for the whole org. A PR that changed on the code host is re-read in the next sweep whatever its Tier.
_Avoid_: Priority, bucket, freshness

**Working Day**:
A day the Team is expected to work: not Friday, Saturday, a chag, an erev chag, or an extra day off declared for the whole org (e.g. election day). Chol hamoed is a Working Day; Yom HaZikaron is not.
_Avoid_: Business day, weekday

**Urgency**:
How loudly a PR's Age calls for attention — four levels, with thresholds in Working Days set once for the whole org. A Draft has no Urgency.
_Avoid_: Staleness, aging, priority

**Notification**:
News for the Viewer about the Team they are looking at: one of its Tracked PRs became Waiting On them, or gave them a new Move, since their browser last saw that Team. News about another Team waits until the Viewer looks at it. Only ever about the Viewer's own moves, never anyone else's. It lasts until the Viewer dismisses it or the PR is no longer on them.
_Avoid_: Alert, turn change

**No Reviewer**:
A PR Awaiting Review that no reviewer owes a move on — none asked, or every ask already met — so it falls to its author to find one, or, on a Bot PR, to whichever Team Member picks it up. Always flagged, never silent, even while its checks fail or it conflicts with its base.
_Avoid_: Nobody's Turn, orphan, unassigned
