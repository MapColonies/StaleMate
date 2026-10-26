import type { Actor, PrFacts, Roster, StackEntryFact, StackFact } from './facts';
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

/** The PR's Stack as the contract has it, but for which siblings the Team tracks, which only the Team's slice knows. */
type Stack = NonNullable<TrackedPr['stack']>;
type HeldBy = NonNullable<Stack['heldBy']>;

/** Whether the code host would let the PR merge as far as its own review decision and checks go. A draft never would. */
function isReady(entry: StackEntryFact): boolean {
  return (
    !entry.isDraft &&
    entry.reviewDecision !== 'reviewRequired' &&
    entry.reviewDecision !== 'changesRequested' &&
    (entry.checkRollup === 'success' || entry.checkRollup === 'none')
  );
}

/**
 * The lowest open PR below this one in its Stack that is not ready by the code host's own verdict, when this PR is itself
 * Approved and Passing. A PR merged out of the Stack no longer holds anything.
 */
function deriveHeldBy(facts: PrFacts, stack: StackFact, isApprovedAndPassing: boolean): HeldBy | undefined {
  if (!isApprovedAndPassing || stack.position <= 1) {
    return undefined;
  }
  const own = stack.entries.find((entry) => entry.repo === facts.repo && entry.number === facts.number);
  // A PR past the entries a long Stack lists has every listed entry below it.
  const below = own === undefined ? (stack.entriesTruncated ? stack.entries : []) : stack.entries.slice(0, stack.entries.indexOf(own));
  const holder = below.find((entry) => entry.state === 'open' && !isReady(entry));
  return holder === undefined ? undefined : { repo: holder.repo, number: holder.number };
}

/** The PR's Stack as the contract has it, with the Stack's real size however many entries were read. Absent for a PR with no Stack. */
function deriveStack(facts: PrFacts, isApprovedAndPassing: boolean): { stack?: TeamFreeStack } {
  const { stack } = facts;
  if (stack === undefined) {
    return {};
  }
  const heldBy = deriveHeldBy(facts, stack, isApprovedAndPassing);
  return {
    stack: {
      number: stack.number,
      position: stack.position,
      size: stack.size,
      siblings: stack.entries.map(({ isDraft, reviewDecision, checkRollup, ...entry }) => ({ ...entry, draft: isDraft })),
      truncated: stack.entriesTruncated,
      ...(heldBy === undefined ? {} : { heldBy }),
    },
  };
}

/** The Stack as derived without a Team: its siblings not yet marked tracked. */
export type TeamFreeStack = Omit<Stack, 'siblings'> & { siblings: Omit<Stack['siblings'][number], 'tracked'>[] };

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
    'id' | 'repo' | 'number' | 'title' | 'url' | 'reviewStatus' | 'approvals' | 'checkStatus' | 'conflicting' | 'jiraTickets' | 'noReviewer'
  > & { stack?: TeamFreeStack };
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
  const checkStatus = deriveCheckStatus(facts, config.excludedChecks);

  return {
    trackedPr: {
      id: facts.id,
      repo: facts.repo,
      number: facts.number,
      title: facts.title,
      url: facts.url,
      reviewStatus: review.status,
      approvals: review.approvals,
      checkStatus,
      conflicting: facts.mergeable === 'conflicting',
      jiraTickets: deriveJiraTickets(facts.title, config.jiraProjectKeys),
      noReviewer: waitingOn.noReviewer,
      ...deriveStack(facts, review.status === 'approved' && checkStatus === 'passing'),
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

/** Whether the Team being viewed tracks the PR in `repo` numbered `number`. */
export type IsTracked = (repo: string, number: number) => boolean;

/** Completes a Tracked PR as seen from a Team, with its Age, Idle Time and Urgency counted up to `now`, and each of its Stack's siblings marked tracked or not by `isTracked`. */
export function withClocks(teamFree: TeamFreePr, teamPart: TeamPart, config: DerivationConfig, now: Date, isTracked: IsTracked): TrackedPr {
  const { id, repo, number, title, url, noReviewer, stack, ...rest } = teamFree.trackedPr;
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
    ...(stack === undefined
      ? {}
      : { stack: { ...stack, siblings: stack.siblings.map((sibling) => ({ ...sibling, tracked: isTracked(sibling.repo, sibling.number) })) } }),
    waitingOn: teamPart.waitingOn,
    noReviewer,
    ...deriveClocks(teamFree.clockStarts, config, now),
  };
}

/** Derives a Tracked PR from its facts, as seen from the Team. Age and Idle Time are counted up to `now`. */
export function deriveTrackedPr(facts: PrFacts, team: Team, config: DerivationConfig, now: Date): TrackedPr {
  const teamFree = deriveTeamFreePr(facts, config);
  // Seen alone, only the PR itself is known to be tracked.
  return withClocks(
    teamFree,
    deriveTeamPart(facts, teamFree, team, config),
    config,
    now,
    (siblingRepo, siblingNumber) => siblingRepo === facts.repo && siblingNumber === facts.number
  );
}

/** Classifies every Team Member. Members whose logins are configured as Bots are Bots. */
export function deriveMembers(roster: Roster, config: Pick<DerivationConfig, 'botLogins'>): Person[] {
  return roster.members.map((member) => toPerson(member, roster, config.botLogins));
}
