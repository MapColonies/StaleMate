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

**Inclusion Reason**:
Why a PR is a Tracked PR (e.g. Team Repo, authored by Team Member, Team Member review requested, Team review requested). A PR can have several.
_Avoid_: Flag, tag, source

### Status

**Review Status**:
Where a PR stands with its reviewers as a whole: Draft, Awaiting Review, Changes Requested, Awaiting Re-review, or Approved. StaleMate judges it by the Team's own norm (one approval, nothing outstanding), not by the code host's verdict or the repo's merge rules. Comments without a verdict, the author's own reviews and Bot reviews never move it.
_Avoid_: State, PR state, review decision

**Answered**:
A reviewer's request for changes that the PR's side has responded to since: every comment thread of that review has an author reply or is resolved (or, if it had no threads, the author commented on the PR), or new commits arrived, or the reviewer was asked to review again. Answered says nothing about agreeing — the author may have pushed back.
_Avoid_: Addressed, fixed, resolved

**Awaiting Re-review**:
The Review Status of a PR whose every outstanding request for changes is Answered, so the reviewers owe another look.
_Avoid_: Changes addressed, ready for review

**Check Status**:
The combined result of a PR's CI checks (passing, failing, pending).
_Avoid_: CI status, build status

**Waiting On**:
The people who owe the next move on a PR — the author, one or more reviewers, or both.
_Avoid_: Turn, ball in court, blocker, assignee

**Waiting Time**:
How long the current Waiting On has held the PR, counted in Working Days.
_Avoid_: Age (that is time since the PR opened), staleness

**Working Day**:
A day the Team is expected to work: not Friday, Saturday, a chag, an erev chag, or an extra day off the Team declares (e.g. election day). Chol hamoed is a Working Day; Yom HaZikaron is not.
_Avoid_: Business day, weekday

**Urgency**:
How loudly a PR's Waiting Time calls for attention — four levels, from under one Working Day up to a full working week or more.
_Avoid_: Staleness, aging, priority

**Nobody's Turn**:
A Tracked PR whose Waiting On is empty — no one owes the next move, so it can sit unnoticed. Always flagged, never silent.
_Avoid_: Orphan, unassigned
