import { describe, expect, it } from 'vitest';
import type { PrFacts } from '@domain/facts';
import type { TrackedPr } from '@domain/trackedPr';
import { deriveTrackedPr } from '@domain/deriveTrackedPr';
import { aDerivationConfig, anActor, aPrFacts, aReview, aReviewThread, aTeam, aThreadComment } from '@tests/utils/facts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const alice = anActor({ id: 'U_alice', login: 'alice' });
const bob = anActor({ id: 'U_bob', login: 'bob' });
const copilot = anActor({ id: 'BOT_copilot', login: 'copilot-pull-request-reviewer', isBot: true });
// Configured as a Bot in bots.logins rather than typed as one by the code host.
const serviceAccount = anActor({ id: 'U_devops', login: 'mapcolonies-devops' });

// Mon 2026-10-12 to Wed 2026-10-14 in Israel: two whole Working Days.
const monday = new Date('2026-10-12T09:00+03:00');
const now = new Date('2026-10-14T09:00+03:00');
const lastWeek = new Date('2026-10-05T09:00+03:00');

function clocksOf(overrides: Partial<PrFacts>, at = now, config = aDerivationConfig()): Pick<TrackedPr, 'age' | 'idleTime' | 'urgency'> {
  const { age, idleTime, urgency } = deriveTrackedPr(aPrFacts({ author: alice, ...overrides }), aTeam(), config, at);
  return { age, idleTime, urgency };
}

describe('Age', function () {
  it('should start at createdAt for a PR that was never a draft', function () {
    const { age } = clocksOf({ createdAt: monday });

    expect(age).toEqual({ workingMs: 2 * DAY, since: monday.toISOString() });
  });

  it('should start when a PR opened as a draft was first marked ready', function () {
    const firstReady = new Date('2026-10-13T09:00+03:00');
    const { age } = clocksOf({
      createdAt: lastWeek,
      timeline: [
        { type: 'readyForReview', at: firstReady, actor: alice },
        { type: 'convertToDraft', at: new Date('2026-10-13T10:00+03:00'), actor: alice },
        { type: 'readyForReview', at: new Date('2026-10-13T11:00+03:00'), actor: alice },
      ],
    });

    expect(age).toEqual({ workingMs: DAY, since: firstReady.toISOString() });
  });

  it('should start at createdAt for a PR opened ready and later sent back to draft', function () {
    const { age } = clocksOf({
      createdAt: monday,
      timeline: [
        { type: 'convertToDraft', at: new Date('2026-10-13T09:00+03:00'), actor: alice },
        { type: 'readyForReview', at: new Date('2026-10-13T11:00+03:00'), actor: alice },
      ],
    });

    expect(age).toEqual({ workingMs: 2 * DAY, since: monday.toISOString() });
  });

  it('should not count a chag, its erev or the weekend', function () {
    // Thu 2026-09-17 to Wed 2026-09-23: erev Yom Kippur is Sunday and Yom Kippur is Monday,
    // so only Thursday from 09:00, Tuesday and Wednesday until 09:00 are working time.
    const { age } = clocksOf({ createdAt: new Date('2026-09-17T09:00+03:00') }, new Date('2026-09-23T09:00+03:00'));

    expect(age.workingMs).toBe(2 * DAY);
  });
});

describe('Idle Time', function () {
  // Tue 2026-10-13 09:00 is one Working Day before now.
  const tuesday = new Date('2026-10-13T09:00+03:00');
  const tuesdayClock = { workingMs: DAY, since: tuesday.toISOString() };

  /** A PR opened and pushed last week, with nothing done on it since unless the overrides add it. */
  function idleTimeOf(overrides: Partial<PrFacts>): TrackedPr['idleTime'] {
    const pushedLastWeek = { ...aPrFacts().headCommit, committedDate: lastWeek, firstCheckSuiteAt: lastWeek };
    return clocksOf({ createdAt: lastWeek, headCommit: pushedLastWeek, ...overrides }).idleTime;
  }

  it.each<[string, Partial<PrFacts>]>([
    // A commit can be pushed long after it was made, so the push is when its first check suite was created.
    ['a push', { headCommit: { ...aPrFacts().headCommit, committedDate: lastWeek, firstCheckSuiteAt: tuesday } }],
    ['a push with no check suite, at its commit date', { headCommit: { ...aPrFacts().headCommit, committedDate: tuesday, firstCheckSuiteAt: null } }],
    ['a review', { reviews: [aReview({ author: bob, submittedAt: tuesday })] }],
    ['a thread comment', { reviewThreads: [aReviewThread({ comments: [aThreadComment({ author: bob, createdAt: tuesday })] })] }],
    ['a PR comment', { timeline: [{ type: 'comment', at: tuesday, actor: bob }] }],
    ['a review request', { timeline: [{ type: 'reviewRequested', at: tuesday, actor: alice, requested: null }] }],
    ['marking the PR ready', { timeline: [{ type: 'readyForReview', at: tuesday, actor: alice }] }],
    ['opening the PR', { createdAt: tuesday }],
  ])('should restart at %s', function (_, overrides) {
    expect(idleTimeOf(overrides)).toEqual(tuesdayClock);
  });

  it('should not restart at Bot activity', function () {
    const idleTime = idleTimeOf({
      reviews: [aReview({ author: copilot, state: 'commented', submittedAt: tuesday })],
      reviewThreads: [aReviewThread({ comments: [aThreadComment({ author: copilot, createdAt: tuesday })] })],
      timeline: [
        { type: 'comment', at: tuesday, actor: serviceAccount },
        { type: 'reviewRequested', at: tuesday, actor: serviceAccount, requested: null },
        { type: 'readyForReview', at: tuesday, actor: serviceAccount },
      ],
    });

    expect(idleTime).toEqual({ workingMs: 7 * DAY, since: lastWeek.toISOString() });
  });

  it('should not restart when a Bot opens the PR', function () {
    expect(idleTimeOf({ author: serviceAccount, createdAt: tuesday })).toEqual({ workingMs: 7 * DAY, since: lastWeek.toISOString() });
  });
});

describe('Urgency', function () {
  const justAfter = (at: string): Date => new Date(new Date(at).getTime() + 1);

  // With the default thresholds of 2, 4 and 8 Working Days, counted back from Wed 2026-10-14 09:00.
  it.each([
    ['just under 2 Working Days', justAfter('2026-10-12T09:00+03:00'), 0],
    ['exactly 2 Working Days', new Date('2026-10-12T09:00+03:00'), 1],
    ['just under 4 Working Days', justAfter('2026-10-08T09:00+03:00'), 1],
    ['exactly 4 Working Days', new Date('2026-10-08T09:00+03:00'), 2],
    ['just under 8 Working Days', justAfter('2026-10-04T09:00+03:00'), 2],
    ['exactly 8 Working Days', new Date('2026-10-04T09:00+03:00'), 3],
  ])('should rate an Age of %s', function (_, createdAt, expected) {
    expect(clocksOf({ createdAt }).urgency).toBe(expected);
  });

  it('should follow the configured thresholds', function () {
    const { urgency } = clocksOf({ createdAt: monday }, now, aDerivationConfig({ urgencyThresholds: [1, 1.5, 2] }));

    expect(urgency).toBe(3);
  });

  it('should give a Draft no Urgency', function () {
    expect(clocksOf({ isDraft: true, createdAt: lastWeek }).urgency).toBeNull();
  });
});
