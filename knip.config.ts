import { KnipConfig } from 'knip';

const config: KnipConfig = {
  $schema: 'https://unpkg.com/knip@6/schema.json',
  ignoreIssues: {
    'apps/*/src/components/ui/**': ['exports'],
  },
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  ignoreDependencies: ['@vitest/eslint-plugin'],
  workspaces: {
    'packages/openapi': {},
    'apps/api': {
      ignoreUnresolved: ['./instrumentation.mjs'],
      // config.get() is typed through lodash's GetFieldType, which needs these types installed.
      ignoreDependencies: ['@types/lodash'],
      // The provider and store seams have no implementation until #18 and #19 land.
      entry: ['src/instrumentation.mts', 'src/providers/prProvider.ts', 'src/cache/snapshotStore.ts'],
    },
    'apps/ui': {},
  },
};

export default config;
