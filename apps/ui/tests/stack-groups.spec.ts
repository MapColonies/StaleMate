import { describe, expect, it } from 'vitest';
import { groupStacks, sameStack } from '@/order/stack-groups';
import { aPr, aStack } from './fixtures/snapshot';

const inStack = (id: string, position: number, overrides: { repo?: string; stack?: number } = {}) =>
  aPr({ id, repo: overrides.repo ?? 'MapColonies/jobnik', stack: aStack(position, 4, { number: overrides.stack ?? 9 }) });
const ids = (prs: { id: string }[]) => prs.map((pr) => pr.id);

describe('groupStacks', () => {
  it('leaves a list with no Stack as it was', () => {
    const prs = [aPr({ id: 'a' }), aPr({ id: 'b' }), aPr({ id: 'c' })];
    expect(ids(groupStacks(prs))).toEqual(['a', 'b', 'c']);
  });

  it('puts a Stack where its best-ranked member sits, in Stack order, bottom first', () => {
    const prs = [aPr({ id: 'a' }), inStack('s3', 3), aPr({ id: 'b' }), inStack('s1', 1), inStack('s2', 2), aPr({ id: 'c' })];
    expect(ids(groupStacks(prs))).toEqual(['a', 's1', 's2', 's3', 'b', 'c']);
  });

  it('keeps ungrouped PRs in their order around a group', () => {
    const prs = [inStack('s2', 2), aPr({ id: 'a' }), inStack('s1', 1), aPr({ id: 'b' })];
    expect(ids(groupStacks(prs))).toEqual(['s1', 's2', 'a', 'b']);
  });

  it('shows one visible member as a plain row where it was', () => {
    const prs = [aPr({ id: 'a' }), inStack('s2', 2), aPr({ id: 'b' })];
    expect(ids(groupStacks(prs))).toEqual(['a', 's2', 'b']);
  });

  it('keeps Stacks apart by repo and Stack number', () => {
    const prs = [
      inStack('x2', 2, { stack: 1 }),
      inStack('y2', 2, { repo: 'MapColonies/other', stack: 1 }),
      inStack('x1', 1, { stack: 1 }),
      inStack('z1', 1, { stack: 2 }),
    ];
    expect(ids(groupStacks(prs))).toEqual(['x1', 'x2', 'y2', 'z1']);
  });

  it('does not change the list it is given', () => {
    const prs = [inStack('s2', 2), inStack('s1', 1)];
    groupStacks(prs);
    expect(ids(prs)).toEqual(['s2', 's1']);
  });
});

describe('sameStack', () => {
  it('is true for two PRs of one Stack only', () => {
    expect(sameStack(inStack('a', 1), inStack('b', 2))).toBe(true);
    expect(sameStack(inStack('a', 1), inStack('b', 2, { stack: 3 }))).toBe(false);
    expect(sameStack(aPr(), aPr())).toBe(false);
  });
});
