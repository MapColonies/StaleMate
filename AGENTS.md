## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `MapColonies/StaleMate` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default label strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### UI rendering

An open dashboard must cost nothing while nothing changes. Keep to these in `apps/ui`:

- Time passing is not a change. Never hold a clock (`useNow`) in `App` or a view; call it in the smallest component that shows elapsed time, at the slowest tick its text needs.
- Views redraw for a new Snapshot or the Viewer's own choices, nothing else. Compute filtering, counts and options with `useMemo` over the Snapshot and filters.
- No endless animation or repaint while idle. `tests/idle-renders.spec.tsx` fails if a view redraws as time passes.
