/* eslint-disable @typescript-eslint/no-magic-numbers -- the fixture's odds and ranges */
import type {
  Actor,
  CheckFact,
  HeadCommitFact,
  Mergeability,
  PrFacts,
  ReviewFact,
  ReviewRequestFact,
  ReviewThreadFact,
  TimelineEventFact,
  WatchedTeam,
} from '@domain/facts';
import { deriveJiraTickets } from '@domain/jiraTickets';
import { deriveInclusionReasons } from '@domain/inclusion';
import type { Discovery, PrProvider } from '../prProvider';
import {
  BOTS,
  DEPENDENCIES,
  ENVIRONMENTS,
  HUMAN_TITLES,
  INFRA_TEAM_SLUG,
  MEMBERS,
  ORG,
  OTHER_REPOS,
  OTHER_TEAM_SLUG,
  OUTSIDERS,
  SERVICE_ACCOUNTS,
  TEAM_REPOS,
  TEAMLESS,
  THREE_D_TEAM_SLUG,
  UNOWNED_REPOS,
} from './fixtureData';

const SEED = 20261012;
const PR_COUNT = 254;
const DAY_MS = 86_400_000;
const PUSH_TO_CHECK_SUITE_MS = 7_000;

/** A seeded generator (mulberry32), so every sweep emits the same PRs. */
class Random {
  public constructor(private state: number) {}

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  public int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  public pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }

  public sample<T>(items: readonly T[], count: number): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
    }
    return shuffled.slice(0, count);
  }

  /** An instant between two others. A skew above 1 leans towards `from`. */
  public between(from: Date, to: Date, skew = 1): Date {
    return new Date(from.getTime() + this.next() ** skew * (to.getTime() - from.getTime()));
  }
}

type ReviewFlow = 'draft' | 'requested' | 'changesRequested' | 'approved' | 'commented' | 'nobody';

const CHECK_ODDS: Record<'bot' | 'human', [CheckFact['state'] | null, number][]> = {
  bot: [
    ['passed', 0.55],
    ['failed', 0.3],
    ['pending', 0.15],
  ],
  human: [
    ['passed', 0.6],
    ['failed', 0.15],
    ['pending', 0.1],
    [null, 0.15],
  ],
};

/** The share of human PRs whose title names a Jira Ticket. */
const JIRA_TICKET_ODDS = 0.85;

const byTime =
  <T>(at: (item: T) => Date) =>
  (a: T, b: T): number =>
    at(a).getTime() - at(b).getTime();

const inOrg = (names: readonly string[]): string[] => names.map((name) => `${ORG}/${name}`);
const actorNamed = (actors: readonly Actor[], login: string): Actor => {
  const actor = actors.find((candidate) => candidate.login === login);
  if (actor === undefined) {
    throw new Error(`the fixture has no ${login}`);
  }
  return actor;
};
const outsider = (login: string): Actor => actorNamed(OUTSIDERS, login);
const member = (login: string): Actor => actorNamed(MEMBERS, login);

/**
 * The Teams the fixture watches, with their real slugs and display names. People and repos sit in more than one Team:
 * CptSchnitz and alex131290 also belong to raster and 3d, and shared-workflows to raster as well as infra.
 */
const TEAMS: WatchedTeam[] = [
  { slug: INFRA_TEAM_SLUG, name: 'Infra', roster: { members: [...MEMBERS, ...SERVICE_ACCOUNTS], repos: inOrg(TEAM_REPOS) } },
  {
    slug: OTHER_TEAM_SLUG,
    name: 'Raster',
    roster: {
      members: [outsider('dana-raster'), outsider('eyal-gis'), member('CptSchnitz')],
      repos: inOrg(['raster-catalog-manager', 'discrete-overseer', 'shared-workflows']),
    },
  },
  {
    slug: THREE_D_TEAM_SLUG,
    name: '3D',
    roster: { members: [outsider('yoav-3d'), outsider('noam-catalog'), member('alex131290')], repos: inOrg(['3d-ingestion-service']) },
  },
  {
    slug: 'vector',
    name: 'Vector',
    roster: { members: [outsider('shira-vector'), outsider('tal-export')], repos: inOrg(['vector-tiles-server', 'export-manager']) },
  },
];

const isTrackedBy = (facts: PrFacts, teams: readonly WatchedTeam[]): boolean => teams.some((team) => deriveInclusionReasons(facts, team).length > 0);

/** Generates one PR's facts. The domain derives everything else, so the facts set up each case rather than state it. */
class PrGenerator {
  private readonly usedNumbers = new Set<string>();

  public constructor(
    private readonly random: Random,
    private readonly now: Date
  ) {}

  public generate(index: number): PrFacts {
    const { random, now } = this;
    const inTeamRepo = random.chance(0.72);
    const repoName = random.pick(inTeamRepo ? TEAM_REPOS : OTHER_REPOS);
    const unowned = UNOWNED_REPOS.includes(repoName);
    const author = unowned && random.chance(0.5) ? random.pick(TEAMLESS) : this.pickAuthor(inTeamRepo);
    const teamless = unowned && TEAMLESS.includes(author);
    // Service accounts are configured as Bots, so they count as Bots here too.
    const byBot = author.isBot || SERVICE_ACCOUNTS.includes(author);

    const ageDays = byBot ? random.next() ** 1.4 * 150 + 0.02 : random.next() ** 2.2 * 70 + 0.03;
    const createdAt = new Date(now.getTime() - ageDays * DAY_MS);
    const flow = this.pickFlow(byBot, inTeamRepo, author);

    const timeline: TimelineEventFact[] = [];
    // Some PRs were opened as drafts and marked ready later, which is when their Age starts.
    let readyAt = createdAt;
    if (flow !== 'draft' && !byBot && random.chance(0.2)) {
      readyAt = random.between(createdAt, now, 2);
      timeline.push({ type: 'readyForReview', at: readyAt, actor: author });
    }

    const reviewerPool = (teamless ? TEAMLESS : inTeamRepo ? MEMBERS : [...MEMBERS, ...OUTSIDERS]).filter((candidate) => candidate !== author);
    const headCommit = this.headCommit(index, readyAt, byBot);
    const facts: PrFacts = {
      id: `PR_fixture_${index}`,
      repo: `${ORG}/${repoName}`,
      number: this.uniqueNumber(repoName),
      title: this.title(author, byBot, repoName),
      url: '',
      isDraft: flow === 'draft',
      createdAt,
      mergeable: this.pickMergeability(),
      author,
      assignees: this.pickAssignees(author),
      headCommit,
      reviews: [],
      reviewRequests: [],
      reviewThreads: [],
      timeline,
    };
    facts.url = `https://github.com/${facts.repo}/pull/${facts.number}`;
    // Like MapColonies' Jira validation, which fails a human PR whose title names no Jira Ticket.
    if (!byBot && headCommit.checks.length > 0) {
      headCommit.checks.push({ name: 'jira/issue-validation', state: deriveJiraTickets(facts.title, ['MAPCO']).length > 0 ? 'passed' : 'failed' });
    }

    this.addReviews(facts, flow, reviewerPool, inTeamRepo, index);
    this.ensureTracked(facts, index);
    facts.reviews.sort(byTime((review) => review.submittedAt));
    facts.timeline.sort(byTime((event) => event.at));
    return facts;
  }

  private pickAuthor(inTeamRepo: boolean): Actor {
    const { random } = this;
    const roll = random.next();
    if (!inTeamRepo) {
      return roll < 0.55 ? random.pick(MEMBERS) : random.pick(OUTSIDERS);
    }
    if (roll < 0.42) {
      return random.pick(MEMBERS);
    }
    if (roll < 0.6) {
      return random.chance(0.85) ? (SERVICE_ACCOUNTS[0] as Actor) : (SERVICE_ACCOUNTS[1] as Actor);
    }
    return roll < 0.8 ? random.pick(BOTS) : random.pick(OUTSIDERS);
  }

  private pickFlow(byBot: boolean, inTeamRepo: boolean, author: Actor): ReviewFlow {
    const { random } = this;
    if (!byBot && random.chance(0.1)) {
      return 'draft';
    }
    const roll = random.next();
    if (roll < 0.4 || (!inTeamRepo && OUTSIDERS.includes(author))) {
      return 'requested';
    }
    if (roll < 0.55) {
      return 'changesRequested';
    }
    if (roll < 0.75) {
      return 'approved';
    }
    return roll < 0.85 ? 'commented' : 'nobody';
  }

  private pickMergeability(): Mergeability {
    const roll = this.random.next();
    if (roll < 0.08) {
      return 'conflicting';
    }
    return roll < 0.15 ? 'unknown' : 'mergeable';
  }

  private pickAssignees(author: Actor): Actor[] {
    const assignees: Actor[] = [];
    if (MEMBERS.includes(author) && this.random.chance(0.25)) {
      assignees.push(author);
    }
    const other = this.random.pick(MEMBERS);
    if (this.random.chance(0.06) && !assignees.includes(other)) {
      assignees.push(other);
    }
    return assignees;
  }

  private headCommit(index: number, readyAt: Date, byBot: boolean): HeadCommitFact {
    const pushedAt = this.random.between(readyAt, this.now, 2);
    const checkState = this.pickCheckState(byBot);
    return {
      oid: `c0ffee${index}`,
      committedDate: new Date(Math.max(readyAt.getTime(), pushedAt.getTime() - PUSH_TO_CHECK_SUITE_MS)),
      firstCheckSuiteAt: checkState === null ? null : pushedAt,
      checks: checkState === null ? [] : [{ name: 'build', state: checkState }],
      checkActivity: checkState === null || checkState === 'pending' ? [] : [pushedAt],
    };
  }

  private pickCheckState(byBot: boolean): CheckFact['state'] | null {
    let roll = this.random.next();
    const odds = CHECK_ODDS[byBot ? 'bot' : 'human'];
    for (const [state, probability] of odds) {
      roll -= probability;
      if (roll < 0) {
        return state;
      }
    }
    return 'passed';
  }

  private addReviews(facts: PrFacts, flow: ReviewFlow, reviewerPool: readonly Actor[], inTeamRepo: boolean, index: number): void {
    const { random } = this;
    const pushedAt = facts.headCommit.firstCheckSuiteAt ?? facts.headCommit.committedDate;
    const review = (author: Actor, state: ReviewFact['state'], suffix: string, commitOid = facts.headCommit.oid): ReviewFact => ({
      id: `PRR_fixture_${index}_${suffix}`,
      state,
      author,
      submittedAt: random.between(pushedAt, this.now),
      commitOid,
      onBehalfOf: [],
    });

    switch (flow) {
      case 'draft':
      case 'nobody':
        return;
      case 'requested': {
        const pool = OUTSIDERS.includes(facts.author) && !inTeamRepo && !TEAMLESS.includes(facts.author) ? MEMBERS : reviewerPool;
        this.request(facts, random.sample(pool, random.chance(0.3) ? 2 : 1));
        if (inTeamRepo && random.chance(0.12)) {
          this.requestTeam(facts, INFRA_TEAM_SLUG);
        } else if (random.chance(0.03)) {
          this.requestTeam(facts, index % 2 === 0 ? OTHER_TEAM_SLUG : THREE_D_TEAM_SLUG);
        }
        return;
      }
      case 'changesRequested': {
        const reviewer = random.pick(reviewerPool);
        // A request for changes given on an earlier commit was Answered by the push since.
        const answered = random.chance(0.35);
        const request = answered
          ? {
              ...review(reviewer, 'changesRequested', 'changes', `${facts.headCommit.oid}-old`),
              submittedAt: random.between(facts.createdAt, pushedAt),
            }
          : review(reviewer, 'changesRequested', 'changes');
        facts.reviews.push(request);
        facts.reviewThreads.push({ isResolved: false, comments: [{ author: reviewer, createdAt: request.submittedAt, reviewId: request.id }] });
        return;
      }
      case 'approved':
        for (const [approvalIndex, reviewer] of random.sample(reviewerPool, random.chance(0.4) ? 2 : 1).entries()) {
          facts.reviews.push(review(reviewer, 'approved', `approval${approvalIndex}`));
        }
        return;
      case 'commented': {
        const reviewer = random.pick(reviewerPool);
        const comments = review(reviewer, 'commented', 'comments');
        facts.reviews.push(comments);
        this.request(facts, [reviewer]);
        const thread: ReviewThreadFact = {
          isResolved: false,
          comments: [{ author: reviewer, createdAt: comments.submittedAt, reviewId: comments.id }],
        };
        // The author replying in the thread puts the move back with the reviewer.
        if (random.chance(0.5)) {
          const reply = { ...review(facts.author, 'commented', 'reply'), submittedAt: random.between(comments.submittedAt, this.now) };
          facts.reviews.push(reply);
          thread.comments.push({ author: facts.author, createdAt: reply.submittedAt, reviewId: reply.id });
        }
        facts.reviewThreads.push(thread);
        return;
      }
    }
  }

  /**
   * A PR no Team tracks, outside the Team Repos with no Team Member involved, gets an Infra Team Member's comment,
   * except in a repo no Team is granted, where some PRs stay untracked.
   */
  private ensureTracked(facts: PrFacts, index: number): void {
    if (isTrackedBy(facts, TEAMS) || UNOWNED_REPOS.includes(facts.repo.slice(ORG.length + 1))) {
      return;
    }
    facts.reviews.push({
      id: `PRR_fixture_${index}_drive-by`,
      state: 'commented',
      author: this.random.pick(MEMBERS),
      submittedAt: this.random.between(facts.createdAt, this.now),
      commitOid: facts.headCommit.oid,
      onBehalfOf: [],
    });
  }

  private request(facts: PrFacts, reviewers: readonly Actor[]): void {
    for (const reviewer of reviewers) {
      this.addRequest(facts, { type: 'person', reviewer, asCodeOwner: false });
    }
  }

  private requestTeam(facts: PrFacts, slug: string): void {
    this.addRequest(facts, { type: 'team', slug, asCodeOwner: this.random.chance(0.5) });
  }

  private addRequest(facts: PrFacts, request: ReviewRequestFact): void {
    facts.reviewRequests.push(request);
    const readyAt = facts.timeline.find((event) => event.type === 'readyForReview')?.at ?? facts.createdAt;
    facts.timeline.push({ type: 'reviewRequested', at: this.random.between(readyAt, this.now, 3), actor: facts.author, requested: request });
  }

  private uniqueNumber(repoName: string): number {
    let number = this.random.int(12, 980);
    while (this.usedNumbers.has(`${repoName}#${number}`)) {
      number++;
    }
    this.usedNumbers.add(`${repoName}#${number}`);
    return number;
  }

  private title(author: Actor, byBot: boolean, repoName: string): string {
    const { random } = this;
    const version = (): string => `${random.int(1, 9)}.${random.int(0, 20)}.${random.int(0, 9)}`;
    if (!byBot) {
      const title = random.pick(HUMAN_TITLES);
      return random.chance(JIRA_TICKET_ODDS) ? `${title} MAPCO-${random.int(10000, 11000)}` : title;
    }
    if (author.isBot) {
      return `chore(deps): bump ${random.pick(DEPENDENCIES)} from ${version()} to ${version()}`;
    }
    return random.pick([
      `chore(helm): bump ${random.pick(TEAM_REPOS)} chart to v${version()}`,
      `chore: update image tags for ${random.pick(ENVIRONMENTS)}`,
      `chore(${repoName}): sync shared workflows`,
    ]);
  }
}

/** When a PR last changed: its latest activity. */
function lastChangedAt(facts: PrFacts): Date {
  const activity = [
    facts.createdAt,
    facts.headCommit.committedDate,
    ...facts.headCommit.checkActivity,
    ...facts.reviews.map((review) => review.submittedAt),
    ...facts.reviewThreads.flatMap((thread) => thread.comments.map((comment) => comment.createdAt)),
    ...facts.timeline.map((event) => event.at),
  ];
  return new Date(Math.max(...activity.map((at) => at.getTime())));
}

/**
 * Serves canned facts translated from the dashboard prototype's mock data, for local development.
 * Every sweep emits the same PRs, dated relative to when the first discovery ran, so they age as time passes
 * and only change when a sweep's tier says to re-read them, like real ones.
 */
export class FixturePrProvider implements PrProvider {
  private firstDiscoveredAt: Date | undefined;

  public constructor(
    private readonly excludedTeams: readonly string[] = [],
    private readonly now: () => Date = (): Date => new Date()
  ) {}

  public async discover(): Promise<Discovery> {
    this.firstDiscoveredAt ??= this.now();
    const teams = TEAMS.filter(({ slug }) => !this.excludedTeams.includes(slug));
    // Like a real discovery, it finds only PRs some watched Team tracks.
    const prs = this.generate(this.firstDiscoveredAt)
      .filter((facts) => isTrackedBy(facts, teams))
      .map((facts) => ({ id: facts.id, updatedAt: lastChangedAt(facts) }));
    return Promise.resolve({ teams, prs });
  }

  public async read(ids: readonly string[]): Promise<PrFacts[]> {
    const byId = new Map(this.generate(this.firstDiscoveredAt ?? this.now()).map((facts) => [facts.id, facts]));
    return Promise.resolve(ids.flatMap((id) => byId.get(id) ?? []));
  }

  private generate(now: Date): PrFacts[] {
    const generator = new PrGenerator(new Random(SEED), now);
    return Array.from({ length: PR_COUNT }, (_, index) => generator.generate(index));
  }
}
