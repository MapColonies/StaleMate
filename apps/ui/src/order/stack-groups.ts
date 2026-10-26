import type { TrackedPr } from '@/snapshot/types';

const stackKey = (pr: TrackedPr): string | null => (pr.stack === undefined ? null : `${pr.repo}#${pr.stack.number}`);

/** Whether two PRs are in one Stack, which GitHub keys by repo and Stack number. A PR with no Stack is in none. */
export function sameStack(a: TrackedPr, b: TrackedPr): boolean {
  const key = stackKey(a);
  return key !== null && key === stackKey(b);
}

/**
 * The list with each Stack's PRs gathered into one run, in Stack Position order (bottom first), sitting where the
 * Stack's best-ranked member sat in the list given. The list must already be in the order wanted, whichever it is:
 * this never ranks, it only gathers. PRs with no Stack, and a Stack's only member, stay where they were.
 */
export function groupStacks(sorted: readonly TrackedPr[]): TrackedPr[] {
  const members = new Map<string, TrackedPr[]>();
  for (const pr of sorted) {
    const key = stackKey(pr);
    if (key !== null) {
      members.set(key, [...(members.get(key) ?? []), pr]);
    }
  }
  const placed = new Set<string>();
  return sorted.flatMap((pr) => {
    const key = stackKey(pr);
    if (key === null) {
      return [pr];
    }
    if (placed.has(key)) {
      return [];
    }
    placed.add(key);
    return (members.get(key) ?? []).toSorted((a, b) => (a.stack?.position ?? 0) - (b.stack?.position ?? 0));
  });
}
