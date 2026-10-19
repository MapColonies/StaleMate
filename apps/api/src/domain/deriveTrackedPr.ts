import type { PrFacts, Roster } from './facts';
import type { Person, TrackedPr } from './trackedPr';
import { deriveReviewStatus } from './reviewStatus';
import { deriveCheckStatus } from './checkStatus';
import { deriveWaitingOn } from './waitingOn';
import { deriveClocks } from './clocks';
import { deriveInclusionReasons, deriveParticipants, toPerson } from './inclusion';

/** The configuration the derivation rules read. */
export interface DerivationConfig {
  /** The Team's slug, e.g. `infra`. */
  teamSlug: string;
  /** Logins that count as Bots, on top of the accounts the code host types as Bot. */
  botLogins: readonly string[];
  /** The Age in Working Days at which Urgency rises to levels 1, 2 and 3. */
  urgencyThresholds: readonly [number, number, number];
  /** Extra days off, as `YYYY-MM-DD` in Asia/Jerusalem. */
  extraNonWorkingDays: readonly string[];
}

/** Derives a Tracked PR from its facts. Age and Idle Time are counted up to `now`. */
export function deriveTrackedPr(facts: PrFacts, roster: Roster, config: DerivationConfig, now: Date): TrackedPr {
  const author = toPerson(facts.author, roster, config.botLogins);
  const review = deriveReviewStatus(facts, config.botLogins);
  const waitingOn = deriveWaitingOn(facts, review, roster, config);
  const clocks = deriveClocks(facts, config, now);

  return {
    id: facts.id,
    repo: facts.repo,
    number: facts.number,
    title: facts.title,
    url: facts.url,
    author,
    ...deriveParticipants(facts, roster, config.botLogins),
    inclusionReasons: deriveInclusionReasons(facts, roster, config.teamSlug),
    reviewStatus: review.status,
    approvals: review.approvals,
    checkStatus: deriveCheckStatus(facts),
    conflicting: facts.mergeable === 'conflicting',
    waitingOn: waitingOn.parties,
    noReviewer: waitingOn.noReviewer,
    ...clocks,
  };
}

/** Classifies every Team Member. Members whose logins are configured as Bots are Bots. */
export function deriveTeam(roster: Roster, config: Pick<DerivationConfig, 'botLogins'>): Person[] {
  return roster.members.map((member) => toPerson(member, roster, config.botLogins));
}
