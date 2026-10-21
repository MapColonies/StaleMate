import type { Actor, PrFacts, TimelineEventFact } from './facts';
import type { DerivationConfig } from './deriveTrackedPr';
import type { Clock, Urgency } from './trackedPr';
import { isBot } from './bots';
import { toWorkingDays, workingMsBetween } from './workingDays';

type ClocksConfig = Pick<DerivationConfig, 'urgencyThresholds' | 'extraNonWorkingDays'>;

const IDLE_TIME_EVENTS: ReadonlySet<TimelineEventFact['type']> = new Set(['readyForReview', 'reviewRequested', 'comment']);

/**
 * When the PR was first ready for review: the earliest ready-for-review event, else when it was opened.
 * A PR sent back to draft before it was ever marked ready was opened ready, so it was ready when it was opened.
 */
function readySince(facts: PrFacts): Date {
  const firstDraftChange = facts.timeline.find((event) => event.type === 'readyForReview' || event.type === 'convertToDraft');
  return firstDraftChange?.type === 'readyForReview' ? firstDraftChange.at : facts.createdAt;
}

/**
 * When a person last acted on the PR: opened it, pushed, reviewed, commented, asked for a review or marked it ready.
 * Bot activity doesn't count. A deleted account was a person.
 */
function lastActivityAt(facts: PrFacts, botLogins: readonly string[]): Date {
  const isHuman = (actor: Actor | null): boolean => actor === null || !isBot(actor, botLogins);

  const openedAt = isHuman(facts.author) ? [facts.createdAt] : [];
  // The code host creates the first check suite as the commit is pushed, which can be long after the commit was made.
  const pushedAt = facts.headCommit.firstCheckSuiteAt ?? facts.headCommit.committedDate;
  const reviewedAt = facts.reviews.filter((review) => isHuman(review.author)).map((review) => review.submittedAt);
  const threadCommentedAt = facts.reviewThreads.flatMap((thread) =>
    thread.comments.filter((comment) => isHuman(comment.author)).map((comment) => comment.createdAt)
  );
  const actedAt = facts.timeline.filter((event) => IDLE_TIME_EVENTS.has(event.type) && isHuman(event.actor)).map((event) => event.at);

  return new Date(Math.max(...[...openedAt, pushedAt, ...reviewedAt, ...threadCommentedAt, ...actedAt].map((at) => at.getTime())));
}

function clockSince(since: Date, config: ClocksConfig, now: Date): Clock {
  return { workingMs: workingMsBetween(since, now, config.extraNonWorkingDays), since: since.toISOString() };
}

/** Urgency rises one level at each threshold the Age has reached. */
function urgencyOf(age: Clock, thresholds: ClocksConfig['urgencyThresholds']): Urgency {
  const ageInWorkingDays = toWorkingDays(age.workingMs);
  return thresholds.filter((threshold) => ageInWorkingDays >= threshold).length;
}

/** What the clocks are counted from. They change only when the PR does, so they are derived when it is read. */
export interface ClockStarts {
  /** Where Age starts. */
  readySince: Date;
  /** Where Idle Time starts. */
  lastActivityAt: Date;
  /** A Draft has no Urgency. */
  isDraft: boolean;
}

export interface Clocks {
  age: Clock;
  idleTime: Clock;
  urgency: Urgency;
}

/** Finds where the PR's clocks start. Bot activity doesn't restart Idle Time. */
export function deriveClockStarts(facts: PrFacts, config: Pick<DerivationConfig, 'botLogins'>): ClockStarts {
  return { readySince: readySince(facts), lastActivityAt: lastActivityAt(facts, config.botLogins), isDraft: facts.isDraft };
}

/** Derives the PR's Age, Idle Time and Urgency in Working Days up to `now`. A Draft has no Urgency. */
export function deriveClocks(starts: ClockStarts, config: ClocksConfig, now: Date): Clocks {
  const age = clockSince(starts.readySince, config, now);
  const idleTime = clockSince(starts.lastActivityAt, config, now);
  return { age, idleTime, urgency: starts.isDraft ? null : urgencyOf(age, config.urgencyThresholds) };
}
