/* eslint-disable @typescript-eslint/no-magic-numbers -- the schema's defaults */
import type { FromExtendedSchema } from 'json-schema-to-ts';
import type { commonBoilerplateV3Type } from '@map-colonies/schemas';
import { typeSymbol } from '@map-colonies/schemas/build/schemas/symbol';

// StaleMate's config schema lives in this repo rather than in @map-colonies/schemas.
// It composes the boilerplate's common sections by $ref, which @map-colonies/config resolves from the schemas package.
// Every Team-specific setting has an x-env-value, so the helm chart can render it into the environment; arrays arrive as JSON.

const stalemateSchema = {
  type: 'object',
  required: ['team', 'bots', 'extraNonWorkingDays', 'urgency', 'sync', 'provider', 'githubApp'],
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
    sync: {
      type: 'object',
      default: {},
      required: ['intervalMs', 'refreshCooldownMs'],
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
