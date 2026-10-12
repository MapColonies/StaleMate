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
A repository the Team has access to on GitHub.
_Avoid_: Owned repo, project

**Tracked PR**:
A PR StaleMate shows: any PR in a Team Repo, or any PR in the org that a Team Member authored, is a requested reviewer on, has reviewed, or is assigned to.
_Avoid_: Watched PR, relevant PR

**Snapshot**:
Every Tracked PR as StaleMate last read it from the code host, stamped with when it was read. A Viewer always sees one Snapshot; there is no history.
_Avoid_: Cache, sync result, data

**Inclusion Reason**:
Why a PR is a Tracked PR (e.g. Team Repo, authored by Team Member, Team Member review requested). A PR can have several.
_Avoid_: Flag, tag, source

### Status

**Review Status**:
Where a PR stands with its reviewers as a whole (e.g. awaiting review, changes requested, approved).
_Avoid_: State, PR state

**Check Status**:
The combined result of a PR's CI checks (passing, failing, pending).
_Avoid_: CI status, build status

**Waiting On**:
The people who owe the next move on a PR — the author, one or more reviewers, or both.
_Avoid_: Turn, ball in court, blocker, assignee

**Waiting Time**:
How long the current Waiting On has held the PR.
_Avoid_: Age (that is time since the PR opened), staleness
