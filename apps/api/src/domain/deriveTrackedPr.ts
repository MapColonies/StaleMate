import type { PrFacts, Roster } from './facts';
import type { Person, TrackedPr } from './trackedPr';
import { deriveReviewStatus } from './reviewStatus';
import { deriveCheckStatus } from './checkStatus';
import { deriveWaitingOn } from './waitingOn';
import { type Clocks, type ClockStarts, deriveClocks, deriveClockStarts } from './clocks';
import { deriveJiraTickets } from './jiraTickets';
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
  /** The names of the checks Check Status leaves out. */
  excludedChecks: readonly string[];
  /** The Jira project keys whose issue keys in a PR title are its Jira Tickets, e.g. `MAPCO`. */
  jiraProjectKeys: readonly string[];
}

/** A Tracked PR without the clocks, which move with time, and what to count them from. */
export interface ClockFreePr {
  trackedPr: Omit<TrackedPr, keyof Clocks>;
  clockStarts: ClockStarts;
}

/** Derives everything about a Tracked PR that changes only when its facts or the Roster do. */
export function deriveClockFreePr(facts: PrFacts, roster: Roster, config: DerivationConfig): ClockFreePr {
  const author = toPerson(facts.author, roster, config.botLogins);
  const review = deriveReviewStatus(facts, config.botLogins);
  const waitingOn = deriveWaitingOn(facts, review, roster, config);

  return {
    trackedPr: {
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
      checkStatus: deriveCheckStatus(facts, config.excludedChecks),
      conflicting: facts.mergeable === 'conflicting',
      jiraTickets: deriveJiraTickets(facts.title, config.jiraProjectKeys),
      waitingOn: waitingOn.parties,
      noReviewer: waitingOn.noReviewer,
    },
    clockStarts: deriveClockStarts(facts, config),
  };
}

/** Completes a Tracked PR with its Age, Idle Time and Urgency, counted up to `now`. */
export function withClocks({ trackedPr, clockStarts }: ClockFreePr, config: DerivationConfig, now: Date): TrackedPr {
  return { ...trackedPr, ...deriveClocks(clockStarts, config, now) };
}

/** Derives a Tracked PR from its facts. Age and Idle Time are counted up to `now`. */
export function deriveTrackedPr(facts: PrFacts, roster: Roster, config: DerivationConfig, now: Date): TrackedPr {
  return withClocks(deriveClockFreePr(facts, roster, config), config, now);
}

/** Classifies every Team Member. Members whose logins are configured as Bots are Bots. */
export function deriveTeam(roster: Roster, config: Pick<DerivationConfig, 'botLogins'>): Person[] {
  return roster.members.map((member) => toPerson(member, roster, config.botLogins));
}
