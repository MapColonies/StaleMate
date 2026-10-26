import { describe, expect, it } from 'vitest';
import { AWAY_LIMIT_MS, dismiss, type NotificationState, notificationsOf, observe } from '@/notifications/engine';
import { migrateNotificationKeys, notificationsKey } from '@/lib/local-storage';
import type { Move, TrackedPr } from '@/snapshot/types';
import { aPr, aSnapshot, bot, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';

const alice = member('alice');
const bob = member('bob');

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-10-14T09:00:00Z');

/** A PR by bob, Waiting On alice for `moves`. */
const onAlice = (id: string, moves: Move[] = ['review']): TrackedPr => aPr({ id, author: bob, waitingOn: [waitingOnReviewer(alice, moves)] });
/** A PR by bob, Waiting On bob. */
const onBob = (id: string): TrackedPr => aPr({ id, author: bob, waitingOn: [waitingOnAuthor(bob)] });
/** A PR by bob that asks the Team for review. */
const viaTeam = (id: string): TrackedPr => aPr({ id, author: bob, requestedReviewers: [], waitingOn: [waitingOnTheTeam] });

interface Pass {
  prs: TrackedPr[];
  at?: number;
  hideViaTeam?: boolean;
  dismiss?: string[];
}

/**
 * alice's browser sees each Snapshot in turn, an hour apart unless `at` says otherwise, dismissing as it goes.
 * Returns what she is shown after the last one, and what was due for a popup in each pass.
 */
function seenBy(passes: Pass[], viewer = 'alice') {
  let state: NotificationState | null = null;
  const due: string[][] = [];
  passes.forEach((pass, index) => {
    const result = observe(state, aSnapshot({ prs: pass.prs }), viewer, pass.hideViaTeam ?? false, pass.at ?? T0 + index * HOUR);
    state = result.state;
    due.push(result.due.map((notification) => notification.prId));
    for (const prId of pass.dismiss ?? []) {
      state = dismiss(state, prId);
    }
  });
  const shown = notificationsOf(state!).map(({ prId, moves }) => ({ prId, moves }));
  return { shown, due, state: state! };
}

describe('the notification engine', () => {
  it('starts quiet on a first visit, whatever is already on the Viewer', () => {
    const { shown, due } = seenBy([{ prs: [onAlice('a'), viaTeam('t')] }]);

    expect(shown).toEqual([]);
    expect(due).toEqual([[]]);
  });

  it.each([
    { case: 'a PR newly on the Viewer by name', pr: onAlice('new', ['review']), moves: ['review'] },
    { case: 'a PR newly on the Viewer with several Moves', pr: onAlice('new', ['fixChecks', 'reply']), moves: ['fixChecks', 'reply'] },
    { case: 'a request to the Team, while via-Team PRs are shown', pr: viaTeam('new'), moves: ['review'] },
    {
      case: 'a Bot PR the Viewer is on',
      pr: aPr({ id: 'new', author: bot('renovate'), waitingOn: [waitingOnReviewer(alice)] }),
      moves: ['review'],
    },
  ])('notifies about $case, for all its Moves', ({ pr, moves }) => {
    const { shown, due } = seenBy([{ prs: [] }, { prs: [pr] }]);

    expect(shown).toEqual([{ prId: 'new', moves }]);
    expect(due).toEqual([[], ['new']]);
  });

  it('says nothing about PRs on someone else', () => {
    const { shown } = seenBy([{ prs: [] }, { prs: [onBob('b'), aPr({ id: 'own team ask', author: alice, waitingOn: [waitingOnTheTeam] })] }]);

    expect(shown).toEqual([]);
  });

  it('says nothing about a request to the Team while via-Team PRs are hidden', () => {
    const { shown } = seenBy([
      { prs: [], hideViaTeam: true },
      { prs: [viaTeam('t')], hideViaTeam: true },
    ]);

    expect(shown).toEqual([]);
  });

  it('notifies about only the new Moves on a PR already on the Viewer', () => {
    const { shown, due } = seenBy([{ prs: [onAlice('a', ['review'])] }, { prs: [onAlice('a', ['review', 'reply'])] }]);

    expect(shown).toEqual([{ prId: 'a', moves: ['reply'] }]);
    expect(due).toEqual([[], ['a']]);
  });

  it('merges a new Move into the PR’s Notification', () => {
    const { shown } = seenBy([{ prs: [] }, { prs: [onAlice('a', ['review'])] }, { prs: [onAlice('a', ['review', 'reply'])] }]);

    expect(shown).toEqual([{ prId: 'a', moves: ['review', 'reply'] }]);
  });

  it('keeps a Notification while the PR stays on the Viewer, without popping it up again', () => {
    const { shown, due } = seenBy([{ prs: [] }, { prs: [onAlice('a')] }, { prs: [onAlice('a')] }]);

    expect(shown).toEqual([{ prId: 'a', moves: ['review'] }]);
    expect(due).toEqual([[], ['a'], []]);
  });

  it('drops a Notification once the PR is no longer on the Viewer', () => {
    const { shown } = seenBy([{ prs: [] }, { prs: [onAlice('a'), onAlice('b')] }, { prs: [onBob('a'), onAlice('b')] }]);

    expect(shown).toEqual([{ prId: 'b', moves: ['review'] }]);
  });

  it('drops a Notification once none of the Moves it told about is owed any more', () => {
    const { shown } = seenBy([
      { prs: [onAlice('a', ['review'])] },
      { prs: [onAlice('a', ['review', 'reply'])] },
      { prs: [onAlice('a', ['review'])] },
    ]);

    expect(shown).toEqual([]);
  });

  it('removes a dismissed Notification, and doesn’t bring it back while nothing changes', () => {
    const { shown, due } = seenBy([{ prs: [] }, { prs: [onAlice('a'), onAlice('b')], dismiss: ['a'] }, { prs: [onAlice('a'), onAlice('b')] }]);

    expect(shown).toEqual([{ prId: 'b', moves: ['review'] }]);
    expect(due).toEqual([[], ['a', 'b'], []]);
  });

  it('notifies again when a dismissed PR gives the Viewer another new Move', () => {
    const { shown } = seenBy([{ prs: [] }, { prs: [onAlice('a', ['review'])], dismiss: ['a'] }, { prs: [onAlice('a', ['review', 'reply'])] }]);

    expect(shown).toEqual([{ prId: 'a', moves: ['reply'] }]);
  });

  it('notifies again when a dismissed PR leaves the Viewer and comes back', () => {
    const { shown, due } = seenBy([{ prs: [] }, { prs: [onAlice('a')], dismiss: ['a'] }, { prs: [onBob('a')] }, { prs: [onAlice('a')] }]);

    expect(shown).toEqual([{ prId: 'a', moves: ['review'] }]);
    expect(due).toEqual([[], ['a'], [], ['a']]);
  });

  it.each([
    { case: 'shown to hidden', from: false, to: true },
    { case: 'hidden to shown', from: true, to: false },
  ])('starts over quietly when via-Team PRs switch from $case', ({ from, to }) => {
    const { shown, due } = seenBy([
      { prs: [], hideViaTeam: from },
      { prs: [onAlice('a')], hideViaTeam: from },
      { prs: [onAlice('a'), onAlice('b'), viaTeam('t')], hideViaTeam: to },
      { prs: [onAlice('a'), onAlice('b'), viaTeam('t')], hideViaTeam: to },
    ]);

    expect(shown).toEqual([]);
    expect(due).toEqual([[], ['a'], [], []]);
  });

  it.each([
    { case: 'just under 4 days', gap: AWAY_LIMIT_MS - 1, shown: [{ prId: 'b', moves: ['review'] }], due: ['b'] },
    { case: 'exactly 4 days', gap: AWAY_LIMIT_MS, shown: [{ prId: 'b', moves: ['review'] }], due: ['b'] },
    { case: 'just over 4 days', gap: AWAY_LIMIT_MS + 1, shown: [], due: [] },
  ])('after $case away, a gap of real time', ({ gap, shown, due }) => {
    const result = seenBy([
      { prs: [], at: T0 },
      { prs: [onAlice('b')], at: T0 + gap },
    ]);

    expect(result.shown).toEqual(shown);
    expect(result.due[1]).toEqual(due);
  });

  it('measures the gap from the last pass, not the first', () => {
    const { shown } = seenBy([
      { prs: [], at: T0 },
      { prs: [], at: T0 + AWAY_LIMIT_MS },
      { prs: [onAlice('b')], at: T0 + 2 * AWAY_LIMIT_MS },
    ]);

    expect(shown).toEqual([{ prId: 'b', moves: ['review'] }]);
  });

  it('starts over after a long gap with what is on the Viewer as the baseline, then notifies about later changes', () => {
    const { shown } = seenBy([
      { prs: [], at: T0 },
      { prs: [onAlice('a')], at: T0 + AWAY_LIMIT_MS + 1 },
      { prs: [onAlice('a'), onAlice('b')], at: T0 + AWAY_LIMIT_MS + 2 },
    ]);

    expect(shown).toEqual([{ prId: 'b', moves: ['review'] }]);
  });

  it('says when it noticed each Notification', () => {
    const { state } = seenBy([
      { prs: [], at: T0 },
      { prs: [onAlice('a')], at: T0 + HOUR },
      { prs: [onAlice('a'), onAlice('b')], at: T0 + 2 * HOUR },
    ]);

    expect(notificationsOf(state).map(({ prId, noticedAt }) => ({ prId, noticedAt }))).toEqual([
      { prId: 'a', noticedAt: T0 + HOUR },
      { prId: 'b', noticedAt: T0 + 2 * HOUR },
    ]);
  });

  it('pops up only the new Moves of a PR that already had a Notification', () => {
    const result = observe(null, aSnapshot({ prs: [] }), 'alice', false, T0);
    const first = observe(result.state, aSnapshot({ prs: [onAlice('a', ['review'])] }), 'alice', false, T0 + HOUR);
    const second = observe(first.state, aSnapshot({ prs: [onAlice('a', ['review', 'reply'])] }), 'alice', false, T0 + 2 * HOUR);

    expect(second.due.map(({ prId, moves }) => ({ prId, moves }))).toEqual([{ prId: 'a', moves: ['reply'] }]);
  });
});

describe('the Notifications storage keys', () => {
  it('keeps each Team’s and Viewer’s state apart', () => {
    expect(notificationsKey('infra', 'alice')).not.toBe(notificationsKey('raster', 'alice'));
    expect(notificationsKey('infra', 'alice')).not.toBe(notificationsKey('infra', 'bob'));
  });

  it('moves each Viewer’s state from before Teams to infra’s, leaving per-Team keys and other settings alone', () => {
    window.localStorage.setItem('stalemate.notifications.alice', 'a');
    window.localStorage.setItem('stalemate.notifications.bob', 'b');
    window.localStorage.setItem(notificationsKey('raster', 'alice'), 'r');
    window.localStorage.setItem('stalemate.viewer', 'alice');

    migrateNotificationKeys();
    migrateNotificationKeys();

    expect(window.localStorage.getItem(notificationsKey('infra', 'alice'))).toBe('a');
    expect(window.localStorage.getItem(notificationsKey('infra', 'bob'))).toBe('b');
    expect(window.localStorage.getItem(notificationsKey('raster', 'alice'))).toBe('r');
    expect(window.localStorage.getItem('stalemate.notifications.alice')).toBeNull();
    expect(window.localStorage.getItem('stalemate.viewer')).toBe('alice');
  });
});
