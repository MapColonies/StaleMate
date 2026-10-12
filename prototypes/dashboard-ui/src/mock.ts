// PROTOTYPE — throwaway. Seeded, realistic-ish mock of ~250 Tracked PRs.
// Team Members and Team Repos are the real @MapColonies/infra ones; everything else is invented.
import { DAY, type CheckStatus, type PR, type Person, type Reason, type ReviewStatus, type WaitingOnEntry } from './model';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = mulberry32(20261012);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const chance = (p: number) => r() < p;
const sample = <T,>(xs: readonly T[], n: number) => [...xs].sort(() => r() - 0.5).slice(0, n);
const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

export const TEAM_SLUG = '@MapColonies/infra';
export const HUMANS = ['AnguIar', 'alex131290', 'CptSchnitz', 'netanelC', 'michalby24', 'ronenkapelian', 'elad-hartog'];
export const SERVICE = ['mapcolonies-devops', 'mapcolonies-org'];
const BOTS = ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]'];
const OUTSIDERS = ['dana-raster', 'yoav-3d', 'shira-vector', 'eyal-gis', 'noam-catalog', 'tal-export'];

export const PEOPLE: Record<string, Person> = Object.fromEntries([
  ...HUMANS.map((l) => [l, { login: l, kind: 'member' }]),
  ...SERVICE.map((l) => [l, { login: l, kind: 'service' }]),
  ...BOTS.map((l) => [l, { login: l, kind: 'bot' }]),
  ...OUTSIDERS.map((l) => [l, { login: l, kind: 'outsider' }]),
  [TEAM_SLUG, { login: TEAM_SLUG, kind: 'team' }],
]);

const TEAM_REPOS = [
  'ts-server-boilerplate', 'ts-npm-package-boilerplate', 'ts-script-boilerplate', 'backstage-content', 'backstage',
  'lookup-tables', 'opa-la', 'shared-workflows', 'nginx', 'jenkins-integration', 'helm-charts', 'config',
  'config-server', 'config-ui', 'infra-portal', 'elastic-alertmanager-connector', 'infra', 'site-values',
  'jobnik-manager', 'infra-copilot-instructions', 'test-site', 'dem-gateway',
];
const OTHER_REPOS = ['raster-catalog-manager', '3d-ingestion-service', 'vector-tiles-server', 'discrete-overseer', 'export-manager', 'mc-map-viewer'];

const DEPS = ['express', '@types/node', 'vite', 'typescript', 'eslint', 'pino', 'zod', 'axios', 'tsyringe', '@opentelemetry/api', 'vitest', 'prettier', 'actions/checkout', 'docker/build-push-action'];
const HUMAN_TITLES = [
  'feat: add retry policy to job polling', 'fix: handle null bbox in tile request', 'refactor: move config schema to shared package',
  'feat(ui): dark mode for config viewer', 'fix: memory leak in websocket reconnect', 'docs: document local dev setup',
  'feat: support multiple OPA bundles per environment', 'fix(helm): correct liveness probe path', 'ci: cache pnpm store in shared workflow',
  'feat: expose prometheus metrics for queue depth', 'chore: migrate to eslint flat config', 'fix: respect TZ in cron schedules',
  'feat: add tracing to config-server client', 'perf: batch elastic writes', 'feat(nginx): add rate limiting snippet',
  'fix: escape label values in alerts', 'feat: openapi validation for jobnik endpoints', 'refactor: drop lodash',
  'feat: site-values for new staging site', 'fix: flaky integration test in lookup-tables', 'feat(backstage): techdocs for infra-portal',
  'chore: upgrade node to 24', 'feat: support bundle signing', 'fix: dem-gateway cache headers', 'feat: paginate config list endpoint',
  'fix: ingestion job stuck in PENDING after restart', 'feat: export manager cleanup cron', 'WIP: new boilerplate structure',
  'feat(config-ui): diff view between versions', 'fix: release-please manifest for monorepo', 'feat: jenkins → github actions migration step 3',
];
const DEVOPS_TITLES = (repo: string) => [
  `chore(helm): bump ${pick(TEAM_REPOS)} chart to v${int(1, 6)}.${int(0, 20)}.${int(0, 9)}`,
  `chore: update image tags for ${pick(['dev', 'qa', 'integration', 'prod'])}`,
  `chore(${repo}): sync shared workflows`,
];

function genPR(i: number, now: number): PR {
  const teamRepo = chance(0.72);
  const repo = teamRepo ? pick(TEAM_REPOS) : pick(OTHER_REPOS);
  const a = r();
  const authorLogin = teamRepo
    ? a < 0.42 ? pick(HUMANS) : a < 0.6 ? (chance(0.85) ? SERVICE[0] : SERVICE[1]) : a < 0.8 ? pick(BOTS) : pick(OUTSIDERS)
    : a < 0.55 ? pick(HUMANS) : pick(OUTSIDERS);
  const author = PEOPLE[authorLogin];
  const automated = author.kind === 'bot' || author.kind === 'service';

  const ageDays = automated ? r() ** 1.4 * 150 + 0.02 : r() ** 2.2 * 70 + 0.03;
  const createdAt = now - ageDays * DAY;
  const waitingSince = now - Math.min(now - createdAt, (now - createdAt) * r() ** 3, r() ** 2 * 20 * DAY);

  const pool = (teamRepo ? HUMANS : [...HUMANS, ...OUTSIDERS]).filter((l) => l !== authorLogin);
  let requested: string[] = [];
  let reviewed: string[] = [];
  let reviewStatus: ReviewStatus;
  let approvals = 0;
  let waitingOn: WaitingOnEntry[] = [];
  const toAuthor = (): WaitingOnEntry[] => [{ login: authorLogin, role: 'author' }];

  const draft = !automated && chance(0.1);
  const s = r();
  if (draft) {
    reviewStatus = 'draft';
    waitingOn = toAuthor();
  } else if (s < 0.4 || (!teamRepo && author.kind === 'outsider')) {
    reviewStatus = 'review-required';
    requested = sample(teamRepo || author.kind !== 'outsider' ? pool : HUMANS, chance(0.3) ? 2 : 1);
    if (teamRepo && chance(0.08)) requested.push(TEAM_SLUG);
    waitingOn = requested.map((login) => ({ login, role: 'reviewer' }));
  } else if (s < 0.55) {
    reviewStatus = 'changes-requested';
    reviewed = sample(pool, 1);
    waitingOn = toAuthor();
  } else if (s < 0.75) {
    reviewStatus = 'approved';
    reviewed = sample(pool, chance(0.4) ? 2 : 1);
    approvals = reviewed.length;
    waitingOn = toAuthor();
  } else if (s < 0.85) {
    reviewStatus = 'commented';
    reviewed = sample(pool, 1);
    requested = [...reviewed];
    waitingOn = requested.map((login) => ({ login, role: 'reviewer' }));
  } else {
    // nobody requested, nobody reviewed — whose move is it?
    reviewStatus = 'review-required';
  }

  const c = r();
  const checkStatus: CheckStatus = automated
    ? c < 0.55 ? 'passing' : c < 0.85 ? 'failing' : 'pending'
    : c < 0.6 ? 'passing' : c < 0.75 ? 'failing' : c < 0.85 ? 'pending' : 'none';
  if (checkStatus === 'failing' && waitingOn.length && waitingOn.every((w) => w.role === 'reviewer')) {
    waitingOn = [...toAuthor(), ...waitingOn]; // both
  }

  const assignees: string[] = [];
  if (author.kind === 'member' && chance(0.25)) assignees.push(authorLogin);
  if (chance(0.06)) assignees.push(pick(HUMANS));

  const reasons: Reason[] = [];
  if (teamRepo) reasons.push('team-repo');
  if (author.kind === 'member' || author.kind === 'service') reasons.push('authored');
  if (requested.some((l) => HUMANS.includes(l))) reasons.push('review-requested');
  if (requested.includes(TEAM_SLUG)) reasons.push('team-requested');
  if (reviewed.some((l) => HUMANS.includes(l))) reasons.push('reviewed');
  if (assignees.some((l) => HUMANS.includes(l))) reasons.push('assigned');
  if (!reasons.length) {
    // outside repo, outsider author, no team involvement yet — make a member a reviewer so it's tracked
    const m = pick(HUMANS);
    reviewed = [m];
    reasons.push('reviewed');
  }

  const number = int(12, 980);
  const title = automated
    ? author.kind === 'bot'
      ? `chore(deps): bump ${pick(DEPS)} from ${int(1, 9)}.${int(0, 20)}.${int(0, 9)} to ${int(1, 9)}.${int(0, 20)}.${int(0, 9)}`
      : pick(DEVOPS_TITLES(repo))
    : pick(HUMAN_TITLES);

  return {
    id: `pr-${i}`,
    repo,
    number,
    title,
    url: `https://github.com/MapColonies/${repo}/pull/${number}`,
    author,
    createdAt,
    waitingSince,
    reviewStatus,
    checkStatus,
    waitingOn,
    requested,
    reviewed,
    assignees,
    reasons,
    approvals,
    additions: automated ? int(1, 40) : int(3, 900),
    deletions: automated ? int(1, 40) : int(0, 400),
  };
}

const NOW = Date.now();
export const PRS: PR[] = Array.from({ length: 254 }, (_, i) => genPR(i, NOW));
export const ALL_REPOS = [...new Set(PRS.map((p) => p.repo))].sort();
export const ALL_AUTHORS = [...new Set(PRS.map((p) => p.author.login))].sort((a, b) => a.localeCompare(b));
export const ALL_REVIEWERS = [...new Set(PRS.flatMap((p) => [...p.requested, ...p.reviewed]))].sort((a, b) => a.localeCompare(b));
export const ALL_WAITING_ON = [...new Set(PRS.flatMap((p) => p.waitingOn.map((w) => w.login)))].sort((a, b) => a.localeCompare(b));
/** Viewer picker: human Team Members only (service accounts excluded — open question on the map). */
export const VIEWER_OPTIONS = HUMANS;
