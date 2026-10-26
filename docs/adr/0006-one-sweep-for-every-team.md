# One sweep serves every Team, sliced per Team

StaleMate watches every Team in the org, not one. On 2026-10-25 that was 9 Teams with 41 people in them: 7 of those people are in more than one Team, and 19 of the 155 live Team Repos belong to more than one Team. A sweep still runs once, over the union of every Team. One roster query reads every Team with its members and repos. Discovery runs the existing batched searches over the union: every Team's repos, every member, and requests to any Team. Each PR is read once, on its Tier. Only Inclusion Reasons, whether a person is a member, and whether a team request is to "the Team" depend on the Team. The sweep derives these for each Team that tracks the PR, and builds each Team's slice once. `GET /snapshot?team=<slug>` serves one slice, in the single-Team shape, with its own ETag.

A PR no Team tracks is never read. Most of the org's ~200 repos that belong to no Team hold such PRs.

## Considered Options

- **One sweep per Team**: rejected. Shared repos and multi-Team people's PRs would be discovered and read several times, and nine loops would compete for one rate limit.
- **Discover with one `org:` search**: rejected. GitHub caps a search at 1,000 results, and the org had 1,761 open PRs. The search would also return PRs no Team tracks, which would then be read for nothing.
- **One org-wide payload, filtered in the UI**: rejected. It is about 5× today's payload on every poll. The Team-relative fields would have to be sent once per Team, or worked out again in the browser.
