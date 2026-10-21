/* eslint-disable @typescript-eslint/no-magic-numbers -- the schema's defaults */
import type { FromExtendedSchema } from 'json-schema-to-ts';
import type { commonBoilerplateV3Type } from '@map-colonies/schemas';
import { typeSymbol } from '@map-colonies/schemas/build/schemas/symbol';

// StaleMate's config schema lives in this repo rather than in @map-colonies/schemas.
// It composes the boilerplate's common sections by $ref, which @map-colonies/config resolves from the schemas package.
// Every Team-specific setting has an x-env-value, so the helm chart can render it into the environment; arrays arrive as JSON.

const stalemateSchema = {
  type: 'object',
  required: ['team', 'bots', 'extraNonWorkingDays', 'urgency', 'checks', 'jira', 'sync', 'provider', 'githubApp'],
  properties: {
    team: {
      type: 'object',
      default: {},
      required: ['slug'],
      additionalProperties: false,
      properties: {
        slug: { type: 'string', default: 'infra', description: 'The slug of the GitHub Team whose PRs are tracked', 'x-env-value': 'TEAM_SLUG' },
      },
    },
    bots: {
      type: 'object',
      default: {},
      required: ['logins'],
      additionalProperties: false,
      properties: {
        logins: {
          type: 'array',
          default: ['mapcolonies-devops', 'mapcolonies-org'],
          description: 'Logins that count as Bots, on top of the accounts GitHub types as Bot',
          items: { type: 'string' },
          'x-env-value': 'BOTS_LOGINS',
          'x-env-format': 'json',
        },
      },
    },
    extraNonWorkingDays: {
      type: 'array',
      default: ['2026-10-27'],
      description: 'Extra days off the Team declares, as YYYY-MM-DD in Asia/Jerusalem',
      items: { type: 'string', format: 'date' },
      'x-env-value': 'EXTRA_NON_WORKING_DAYS',
      'x-env-format': 'json',
    },
    urgency: {
      type: 'object',
      default: {},
      required: ['thresholds'],
      additionalProperties: false,
      properties: {
        thresholds: {
          type: 'array',
          default: [2, 4, 8],
          description: 'The Age in Working Days at which Urgency rises to levels 1, 2 and 3',
          minItems: 3,
          maxItems: 3,
          items: { type: 'number', minimum: 0 },
          'x-env-value': 'URGENCY_THRESHOLDS',
          'x-env-format': 'json',
        },
      },
    },
    checks: {
      type: 'object',
      default: {},
      required: ['excluded'],
      additionalProperties: false,
      properties: {
        excluded: {
          type: 'array',
          default: ['jira/issue-validation', 'jira-validation'],
          description: 'Names of the check runs and status contexts that Check Status leaves out',
          items: { type: 'string' },
          'x-env-value': 'EXCLUDED_CHECKS',
          'x-env-format': 'json',
        },
      },
    },
    jira: {
      type: 'object',
      default: {},
      required: ['baseUrl', 'projectKeys'],
      additionalProperties: false,
      properties: {
        baseUrl: {
          type: 'string',
          default: 'https://mapcolonies.atlassian.net',
          description: 'The Jira site Jira Tickets link to. Empty hides them, and whether a PR lacks one',
          'x-env-value': 'JIRA_BASE_URL',
        },
        projectKeys: {
          type: 'array',
          default: ['MAPCO'],
          description: 'The Jira project keys whose issue keys in a PR title count as Jira Tickets',
          items: { type: 'string', pattern: '^[A-Z][A-Z0-9]+$' },
          'x-env-value': 'JIRA_PROJECT_KEYS',
          'x-env-format': 'json',
        },
      },
    },
    sync: {
      type: 'object',
      default: {},
      required: ['intervalMs', 'refreshCooldownMs', 'tiers'],
      additionalProperties: false,
      properties: {
        intervalMs: {
          type: 'integer',
          default: 120000,
          minimum: 1000,
          description: 'How long to wait after a sweep ends before starting the next',
          'x-env-value': 'SYNC_INTERVAL_MS',
        },
        refreshCooldownMs: {
          type: 'integer',
          default: 30000,
          minimum: 0,
          description: 'How long after a sweep starts before "Refresh now" can start another',
          'x-env-value': 'SYNC_REFRESH_COOLDOWN_MS',
        },
        tiers: {
          type: 'object',
          default: {},
          required: ['warmFromWorkingDays', 'coldFromWorkingDays', 'warmReadIntervalMs', 'coldReadIntervalMs'],
          additionalProperties: false,
          description: 'How often a sweep re-reads a Tracked PR it has, by its Idle Time. Hot PRs are re-read every sweep',
          properties: {
            warmFromWorkingDays: {
              type: 'number',
              default: 10,
              minimum: 0,
              description: 'The Idle Time in Working Days from which a PR is Warm rather than Hot',
              'x-env-value': 'SYNC_TIERS_WARM_FROM_WORKING_DAYS',
            },
            coldFromWorkingDays: {
              type: 'number',
              default: 60,
              minimum: 0,
              description: 'The Idle Time in Working Days, about 3 months, from which a PR is Cold rather than Warm',
              'x-env-value': 'SYNC_TIERS_COLD_FROM_WORKING_DAYS',
            },
            warmReadIntervalMs: {
              type: 'integer',
              default: 900000,
              minimum: 0,
              description: 'How long after a Warm PR was read before a sweep re-reads it',
              'x-env-value': 'SYNC_TIERS_WARM_READ_INTERVAL_MS',
            },
            coldReadIntervalMs: {
              type: 'integer',
              default: 3600000,
              minimum: 0,
              description: 'How long after a Cold PR was read before a sweep re-reads it',
              'x-env-value': 'SYNC_TIERS_COLD_READ_INTERVAL_MS',
            },
          },
        },
      },
    },
    provider: {
      type: 'string',
      enum: ['github', 'fixture'],
      default: 'github',
      description: 'Where PR facts come from: GitHub, or canned fixtures for local development',
      'x-env-value': 'PROVIDER',
    },
    githubToken: {
      type: 'string',
      description: 'A personal token for local development, used when githubApp.appId is not set',
      'x-env-value': 'GITHUB_TOKEN',
    },
    githubApp: {
      type: 'object',
      default: {},
      additionalProperties: false,
      description: 'The GitHub App StaleMate authenticates as in production. Used when appId is set',
      properties: {
        appId: { type: 'integer', 'x-env-value': 'GITHUB_APP_ID' },
        installationId: { type: 'integer', 'x-env-value': 'GITHUB_APP_INSTALLATION_ID' },
        privateKeyPath: { type: 'string', description: "Path to the App's PEM private key", 'x-env-value': 'GITHUB_APP_PRIVATE_KEY_PATH' },
      },
    },
  },
} as const;

type StalemateConfig = FromExtendedSchema<{ 'x-env-value': string; 'x-env-format': 'json' }, typeof stalemateSchema>;

// Flattened into one object type: lodash's GetFieldType, which types config.get(), gives up on intersections.
export type ConfigSchemaType = { [K in keyof (commonBoilerplateV3Type & StalemateConfig)]: (commonBoilerplateV3Type & StalemateConfig)[K] };

export const configSchema = {
  // @map-colonies/config reads the config's type from this key.
  [typeSymbol]: '' as unknown as ConfigSchemaType,
  $id: 'https://mapcolonies.com/infra/stalemate/v1',
  title: 'stalemateApiV1',
  description: 'The StaleMate API configuration',
  type: 'object',
  allOf: [{ $ref: 'https://mapcolonies.com/common/boilerplate/v3' }, stalemateSchema],
};
