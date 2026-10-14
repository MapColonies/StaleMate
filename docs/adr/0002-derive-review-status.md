# StaleMate derives Review Status itself instead of reading GitHub's `reviewDecision`

GitHub's `reviewDecision` looks like the obvious source for a PR's Review Status, but StaleMate doesn't fetch it. In live MapColonies data it was null on a PR with two approvals under an active review ruleset, and REVIEW_REQUIRED on PRs where nobody was requested. It also has no timestamp, and only GitHub has it, so a GitLab adapter would need a different source anyway. Instead, the domain derives Review Status from the neutral review facts each provider emits. It judges by a fixed Team norm of one current approval with nothing outstanding, not by each repo's merge rules or CODEOWNERS. A survey of the Team Repos found none requiring more than one approval.

## Considered Options

- **Show `reviewDecision` as-is**: rejected because it is unreliable and GitHub-only.
- **Derive it, modelling each repo's merge rules** (`refUpdateRule` + rulesets, required counts, last-push approval): rejected. It is a lot of logic for repos that barely enforce any rules, and the admin-only settings aren't readable anyway.
- **Check CODEOWNERS approval**: rejected for v1. It needs Contents permission and path matching, so code-owner requests count as ordinary requests instead.
