import type { Actor, PrFacts, Roster } from './facts';
import type { InclusionReason, Person, TrackedPr, WaitingOnParty } from './trackedPr';
import { deriveReviewStatus } from './reviewStatus';
import { deriveCheckStatus } from './checkStatus';
import { deriveWaitingOn, resolveWaitingOn, type TeamFreeParty } from './waitingOn';
import { type ClockStarts, deriveClocks, deriveClockStarts } from './clocks';
import { deriveJiraTickets } from './jiraTickets';
import {
  classifyParticipants,
  deriveInclusionReasons,
  deriveParticipantActors,
  type ParticipantActors,
  type Participants,
  type Team,
  toPerson,
} from './inclusion';

/** The PR's Stack as the contract has it, with the Stack's real size however many entries were read. Absent for a PR with no Stack. */
function deriveStack(facts: PrFacts): Pick<TrackedPr, 'stack'> {
  const { stack } = facts;
  if (stack === undefined) {
    return {};
  }
  return {
    stack: {
      number: stack.number,
      position: stack.position,
      size: stack.size,
      siblings: stack.entries.map(({ isDraft, ...entry }) => ({ ...entry, draft: isDraft })),
      truncated: stack.entriesTruncated,
    },
  };
}

/** The configuration the derivation rules read. */
export interface DerivationConfig {
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

/** What is derived from a PR's facts alone, with no Team and no roster. Everything but the clocks, which move with time. */
export interface TeamFreePr {
  trackedPr: Pick<
    TrackedPr,
    'id' | 'repo' | 'number' | 'title' | 'url' | 'reviewStatus' | 'approvals' | 'checkStatus' | 'conflicting' | 'jiraTickets' | 'noReviewer' | 'stack'
  >;
  /** The accounts around the PR, not yet classified. */
  author: Actor;
  participants: ParticipantActors;
  waitingOn: TeamFreeParty[];
  /** What to count the clocks from. */
  clockStarts: ClockStarts;
}

/** What depends on the Team a PR is seen from. */
export interface TeamPart {
  author: Person;
  participants: Participants;
  inclusionReasons: InclusionReason[];
  waitingOn: WaitingOnParty[];
}

/** Derives everything about a PR that needs neither a Team nor a roster. It changes only when the PR's facts do. */
export function deriveTeamFreePr(facts: PrFacts, config: DerivationConfig): TeamFreePr {
  const review = deriveReviewStatus(facts, config.botLogins);
  const waitingOn = deriveWaitingOn(facts, review, config);

  return {
    trackedPr: {
      id: facts.id,
      repo: facts.repo,
      number: facts.number,
      title: facts.title,
      url: facts.url,
      reviewStatus: review.status,
      approvals: review.approvals,
      checkStatus: deriveCheckStatus(facts, config.excludedChecks),
      conflicting: facts.mergeable === 'conflicting',
      jiraTickets: deriveJiraTickets(facts.title, config.jiraProjectKeys),
      noReviewer: waitingOn.noReviewer,
      ...deriveStack(facts),
    },
    author: facts.author,
    participants: deriveParticipantActors(facts, config.botLogins),
    waitingOn: waitingOn.parties,
    clockStarts: deriveClockStarts(facts, config),
  };
}

/** Derives what depends on the Team: Inclusion Reasons, each person's kind and whether a team request is to the Team. It changes with the facts or the Team's roster. */
export function deriveTeamPart(facts: PrFacts, teamFree: TeamFreePr, team: Team, config: DerivationConfig): TeamPart {
  return {
    author: toPerson(teamFree.author, team.roster, config.botLogins),
    participants: classifyParticipants(teamFree.participants, team.roster, config.botLogins),
    inclusionReasons: deriveInclusionReasons(facts, team),
    waitingOn: resolveWaitingOn(teamFree.waitingOn, team, config),
  };
}

/** Completes a Tracked PR as seen from a Team, with its Age, Idle Time and Urgency counted up to `now`. */
export function withClocks(teamFree: TeamFreePr, teamPart: TeamPart, config: DerivationConfig, now: Date): TrackedPr {
  const { id, repo, number, title, url, noReviewer, ...rest } = teamFree.trackedPr;
  return {
    id,
    repo,
    number,
    title,
    url,
    author: teamPart.author,
    ...teamPart.participants,
    inclusionReasons: teamPart.inclusionReasons,
    ...rest,
    waitingOn: teamPart.waitingOn,
    noReviewer,
    ...deriveClocks(teamFree.clockStarts, config, now),
  };
}

/** Derives a Tracked PR from its facts, as seen from the Team. Age and Idle Time are counted up to `now`. */
export function deriveTrackedPr(facts: PrFacts, team: Team, config: DerivationConfig, now: Date): TrackedPr {
  const teamFree = deriveTeamFreePr(facts, config);
  return withClocks(teamFree, deriveTeamPart(facts, teamFree, team, config), config, now);
}

/** Classifies every Team Member. Members whose logins are configured as Bots are Bots. */
export function deriveMembers(roster: Roster, config: Pick<DerivationConfig, 'botLogins'>): Person[] {
  return roster.members.map((member) => toPerson(member, roster, config.botLogins));
}
