/**
 * Records a sweep of MapColonies by the real GitHub provider, trimmed to a handful of PRs, as the fixtures in ./recording.
 *
 *   GITHUB_TOKEN=$(gh auth token) pnpm --filter stalemate-api record:github
 *
 * StaleMate's repo is public, so the recording is scrubbed:
 * - private Team Repos are left out of the roster, and only PRs in public repos are recorded;
 * - every person gets a stable pseudonym (member-N for Team Members, person-N for others) and a made-up id.
 *   Bots and the configured service accounts keep their real identity, which the domain's rules depend on.
 *
 * The roster is trimmed to RECORDED_TEAMS, so the sweep's union discovery covers several Teams.
 * One edit makes the recording cover a request to a Team: no PR in a live repo asked @infra for review when it was
 * recorded, so the team search's response is given telemetry#96, a real PR that asks @infra, in an archived repo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Registry } from 'prom-client';
import { jsLogger } from '@map-colonies/js-logger';
import { createGithubPrProvider } from '@src/providers/github/githubPrProvider';
import { createSyncMetrics } from '@src/sync/syncMetrics';
import { sweep } from '../../utils/sweep';
import { NODES_FIXTURE_PREFIXES, RECORDED_BATCH_SIZE, RECORDING_DIR, SearchFixtureNames } from './recording';

const RECORDED_PRS = [
  // A request for changes with a thread, in a Team Repo.
  'MapColonies/opa-la#160',
  // A dismissed review, the author's replies as reviews, and a ready-for-review event.
  'MapColonies/schemas#66',
  // A draft by a Bot.
  'MapColonies/config-ui#62',
  // A Copilot review, an approval, and many threads.
  'MapColonies/javascript-github-actions#17',
  // A conflict and failing checks.
  'MapColonies/jobnik-manager#247',
  // A PR by a service account.
  'MapColonies/infra-packages#33',
  // Two PRs in the middle of a real Stack (jobnik #64-#67, whose Stack is numbered 68), with its entries and their review and check state.
  'MapColonies/jobnik#65',
  'MapColonies/jobnik#66',
];
/** The Teams the recording keeps, out of every Team in the org. */
const RECORDED_TEAMS = ['infra', 'raster-team'];
const INJECTED_TEAM_REQUEST = 'MapColonies/telemetry#96';
const JSON_INDENT = 2;
const SERVICE_ACCOUNTS = new Set(['mapcolonies-devops', 'mapcolonies-org']);

const token = process.env.GITHUB_TOKEN;
if (token === undefined || token === '') {
  throw new Error('set GITHUB_TOKEN, e.g. GITHUB_TOKEN=$(gh auth token)');
}

type Json = Record<string, unknown>;

async function graphql(query: string, variables: Json = {}): Promise<Json> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data: Json; errors?: unknown };
  if (body.errors !== undefined) {
    throw new Error(`query failed: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

/** A PR as a search finds it. */
interface FoundPr {
  id: string;
  updatedAt: string;
}

/** Looks up the PRs as a search would find them, refusing any in a private repo. */
async function lookUpPrs(refs: string[]): Promise<FoundPr[]> {
  const prs: FoundPr[] = [];
  for (const ref of refs) {
    const [owner, name, number] = ref.split(/[/#]/);
    const data = await graphql(
      'query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { isPrivate pullRequest(number: $number) { id updatedAt } } }',
      { owner, name, number: Number(number) }
    );
    const repository = data.repository as { isPrivate: boolean; pullRequest: FoundPr };
    if (repository.isPrivate) {
      throw new Error(`${ref} is in a private repo`);
    }
    prs.push(repository.pullRequest);
  }
  return prs;
}

async function privateTeamRepos(): Promise<Set<string>> {
  const data = await graphql(`
    query {
      organization(login: "MapColonies") {
        teams(first: 100) {
          nodes {
            repositories(first: 100) {
              nodes {
                nameWithOwner
                isPrivate
              }
            }
          }
        }
      }
    }
  `);
  const teams = (data.organization as { teams: { nodes: { repositories: { nodes: { nameWithOwner: string; isPrivate: boolean }[] } }[] } }).teams
    .nodes;
  return new Set(teams.flatMap((team) => team.repositories.nodes.filter((repo) => repo.isPrivate).map((repo) => repo.nameWithOwner)));
}

/** Gives every person a stable pseudonym, Team Members first. */
class Pseudonyms {
  public readonly realLogins = new Set<string>();
  private readonly byId = new Map<string, { id: string; login: string }>();
  private members = 0;
  private others = 0;

  public addMember(id: string, login: string): void {
    this.add(id, login, () => `member-${++this.members}`);
  }

  public scrub(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.scrub(item));
    }
    if (value === null || typeof value !== 'object') {
      return value;
    }
    const object = value as Json;
    // GitHub types some Bots as Users, but their ids still say Bot.
    const isPerson =
      (object.__typename === 'User' || object.__typename === 'Mannequin') &&
      typeof object.login === 'string' &&
      !String(object.id).startsWith('BOT_');
    if (isPerson && !SERVICE_ACCOUNTS.has(object.login as string)) {
      const pseudonym = this.add(object.id as string, object.login as string, () => `person-${++this.others}`);
      return { ...object, ...pseudonym };
    }
    return Object.fromEntries(Object.entries(object).map(([key, child]) => [key, this.scrub(child)]));
  }

  private add(id: string, login: string, nextLogin: () => string): { id: string; login: string } {
    let pseudonym = this.byId.get(id);
    if (pseudonym === undefined) {
      const fakeLogin = nextLogin();
      pseudonym = { id: `U_${fakeLogin.replace('-', '_')}`, login: fakeLogin };
      this.byId.set(id, pseudonym);
      this.realLogins.add(login);
    }
    return pseudonym;
  }
}

async function main(): Promise<void> {
  const recorded = new Set((await lookUpPrs(RECORDED_PRS)).map((pr) => pr.id));
  const [injected] = await lookUpPrs([INJECTED_TEAM_REQUEST]);
  const privateRepos = await privateTeamRepos();
  const responses = new Map<string, Json>();
  const nodesCalls = new Map<string, number>();
  const searchNames = new SearchFixtureNames();

  /** Passes the provider's queries to GitHub, trimming what it reads to the recorded PRs, and keeps every response. */
  const recordingFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const { query, variables } = JSON.parse(init?.body as string) as { query: string; variables: Json };
    const operation = /^\s*query\s+(\w+)/.exec(query)?.[1] ?? '';
    let body: Json;
    let name: string;

    if (operation === 'SearchPullRequests') {
      // Read every page, keep only the recorded PRs, and answer with them as one page.
      const nodes: FoundPr[] = [];
      let after: string | null = null;
      let rateLimit: unknown;
      do {
        const data = await graphql(query, { ...variables, after });
        const search = data.search as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: FoundPr[] };
        nodes.push(...search.nodes.filter((node) => recorded.has(node.id)));
        rateLimit = data.rateLimit;
        after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
      } while (after !== null);
      name = searchNames.next(variables.query as string);
      if (name.startsWith('search-team-requests') && injected !== undefined) {
        nodes.push(injected);
      }
      body = {
        data: { search: { issueCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes }, rateLimit },
      };
    } else {
      const response = await fetch(input, init);
      body = (await response.json()) as Json;
      if (operation === 'Roster') {
        const teams = (body.data as { organization: { teams: { nodes: { slug: string; repositories: { nodes: { nameWithOwner: string }[] } }[] } } })
          .organization.teams;
        teams.nodes = teams.nodes.filter((team) => RECORDED_TEAMS.includes(team.slug));
        for (const team of teams.nodes) {
          team.repositories.nodes = team.repositories.nodes.filter((repo) => !privateRepos.has(repo.nameWithOwner));
        }
        name = 'roster';
      } else {
        const prefix = NODES_FIXTURE_PREFIXES[operation] ?? operation;
        const call = (nodesCalls.get(prefix) ?? 0) + 1;
        nodesCalls.set(prefix, call);
        name = `${prefix}-${call}`;
      }
    }
    responses.set(name, body);
    return Response.json(body);
  };

  const logger = await jsLogger({ level: 'info' });
  const provider = createGithubPrProvider({
    githubToken: token,
    githubApp: {},
    logger,
    metrics: createSyncMetrics(new Registry()),
    fetch: recordingFetch,
    batchSize: RECORDED_BATCH_SIZE,
  });
  const { prs } = await sweep(provider);

  const pseudonyms = new Pseudonyms();
  const roster = responses.get('roster') as {
    data: { organization: { teams: { nodes: { members: { nodes: { id: string; login: string }[] } }[] } } };
  };
  for (const team of roster.data.organization.teams.nodes) {
    for (const member of team.members.nodes) {
      if (!SERVICE_ACCOUNTS.has(member.login)) {
        pseudonyms.addMember(member.id, member.login);
      }
    }
  }

  await mkdir(RECORDING_DIR, { recursive: true });
  const scrubbed = [...responses].map(([name, body]) => [name, JSON.stringify(pseudonyms.scrub(body), null, JSON_INDENT) + '\n'] as const);
  // A login can also turn up in free text, such as a title, which the scrub doesn't reach.
  for (const [name, text] of scrubbed) {
    const leaked = [...pseudonyms.realLogins].filter((login) => text.toLowerCase().includes(login.toLowerCase()));
    if (leaked.length > 0) {
      throw new Error(`${name} still names ${leaked.join(', ')}`);
    }
  }
  for (const [name, text] of scrubbed) {
    await writeFile(path.join(RECORDING_DIR, `${name}.json`), text);
  }
  console.log(`recorded ${prs.length} PRs in ${scrubbed.length} responses: ${scrubbed.map(([name]) => name).join(', ')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
