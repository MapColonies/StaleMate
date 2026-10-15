// The dashboard prototype's mock data (prototypes/dashboard-ui/src/mock.ts on prototype/dashboard-ui).
// The Team Members and Team Repos are the real @MapColonies/infra ones; everything else is invented.
import type { Actor } from '@domain/facts';

const human = (login: string): Actor => ({ id: `U_${login}`, login, isBot: false });
// The code host types these as Bots. Their GraphQL logins carry no [bot] suffix.
const bot = (login: string): Actor => ({ id: `BOT_${login}`, login, isBot: true });

export const ORG = 'MapColonies';

export const MEMBERS = ['AnguIar', 'alex131290', 'CptSchnitz', 'netanelC', 'michalby24', 'ronenkapelian', 'elad-hartog'].map(human);
/** Team Members whose logins are configured as Bots. */
export const SERVICE_ACCOUNTS = ['mapcolonies-devops', 'mapcolonies-org'].map(human);
export const BOTS = ['dependabot', 'renovate', 'github-actions'].map(bot);
export const OUTSIDERS = ['dana-raster', 'yoav-3d', 'shira-vector', 'eyal-gis', 'noam-catalog', 'tal-export'].map(human);
/** Another team in the org. A review request to it never puts a Team Member in Waiting On. */
export const OTHER_TEAM_SLUG = 'raster';

export const TEAM_REPOS = [
  'ts-server-boilerplate',
  'ts-npm-package-boilerplate',
  'ts-script-boilerplate',
  'backstage-content',
  'backstage',
  'lookup-tables',
  'opa-la',
  'shared-workflows',
  'nginx',
  'jenkins-integration',
  'helm-charts',
  'config',
  'config-server',
  'config-ui',
  'infra-portal',
  'elastic-alertmanager-connector',
  'infra',
  'site-values',
  'jobnik-manager',
  'infra-copilot-instructions',
  'test-site',
  'dem-gateway',
];
export const OTHER_REPOS = [
  'raster-catalog-manager',
  '3d-ingestion-service',
  'vector-tiles-server',
  'discrete-overseer',
  'export-manager',
  'mc-map-viewer',
];

export const DEPENDENCIES = [
  'express',
  '@types/node',
  'vite',
  'typescript',
  'eslint',
  'pino',
  'zod',
  'axios',
  'tsyringe',
  '@opentelemetry/api',
  'vitest',
  'prettier',
  'actions/checkout',
  'docker/build-push-action',
];

export const HUMAN_TITLES = [
  'feat: add retry policy to job polling',
  'fix: handle null bbox in tile request',
  'refactor: move config schema to shared package',
  'feat(ui): dark mode for config viewer',
  'fix: memory leak in websocket reconnect',
  'docs: document local dev setup',
  'feat: support multiple OPA bundles per environment',
  'fix(helm): correct liveness probe path',
  'ci: cache pnpm store in shared workflow',
  'feat: expose prometheus metrics for queue depth',
  'chore: migrate to eslint flat config',
  'fix: respect TZ in cron schedules',
  'feat: add tracing to config-server client',
  'perf: batch elastic writes',
  'feat(nginx): add rate limiting snippet',
  'fix: escape label values in alerts',
  'feat: openapi validation for jobnik endpoints',
  'refactor: drop lodash',
  'feat: site-values for new staging site',
  'fix: flaky integration test in lookup-tables',
  'feat(backstage): techdocs for infra-portal',
  'chore: upgrade node to 24',
  'feat: support bundle signing',
  'fix: dem-gateway cache headers',
  'feat: paginate config list endpoint',
  'fix: ingestion job stuck in PENDING after restart',
  'feat: export manager cleanup cron',
  'WIP: new boilerplate structure',
  'feat(config-ui): diff view between versions',
  'fix: release-please manifest for monorepo',
  'feat: jenkins → github actions migration step 3',
];

export const ENVIRONMENTS = ['dev', 'qa', 'integration', 'prod'];
