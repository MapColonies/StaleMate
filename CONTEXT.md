# StaleMate

A dashboard that keeps a team from missing PRs: what is open, whose move it is, and how long it has been waiting.

## Language

### Who

**Team**:
The GitHub Team whose work StaleMate watches, e.g. `@MapColonies/infra`.
_Avoid_: Group, squad

**Team Member**:
A person who belongs to the Team.
_Avoid_: User, developer

**Bot**:
A non-human PR author — a GitHub account of type Bot, or a login configured as one.
_Avoid_: Automation, app

**Viewer**:
The person looking at the dashboard, who has said which Team Member they are.
_Avoid_: User, me, current user

### What

**PR**:
A proposed change awaiting merge on a code host. A GitLab Merge Request is a PR.
_Avoid_: Merge request, MR, change request

**Team Repo**:
A live repository the Team is granted on GitHub, at any access level. Archived repositories are not Team Repos.
_Avoid_: Owned repo, project

**Tracked PR**:
A PR StaleMate shows: any PR in a Team Repo, or any PR in the org that a Team Member authored, is a requested reviewer on, has reviewed, or is assigned to, or that asks the Team itself for review. A PR in an archived repository is never a Tracked PR.
_Avoid_: Watched PR, relevant PR

**Snapshot**:
Every Tracked PR as StaleMate last read it from the code host, stamped with when it was read. A Viewer always sees one Snapshot; there is no history.
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

**Working Day**:
A day the Team is expected to work: not Friday, Saturday, a chag, an erev chag, or an extra day off the Team declares (e.g. election day). Chol hamoed is a Working Day; Yom HaZikaron is not.
_Avoid_: Business day, weekday

**Urgency**:
How loudly a PR's Age calls for attention — four levels, with thresholds in Working Days the Team sets. A Draft has no Urgency.
_Avoid_: Staleness, aging, priority

**No Reviewer**:
A PR Awaiting Review that no reviewer owes a move on — none asked, or every ask already met — so it falls to its author to find one, or, on a Bot PR, to whichever Team Member picks it up. Always flagged, never silent, even while its checks fail or it conflicts with its base.
_Avoid_: Nobody's Turn, orphan, unassigned
