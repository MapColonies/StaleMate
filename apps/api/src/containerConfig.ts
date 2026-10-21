import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import { Registry } from 'prom-client';
import { instanceCachingFactory } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe/dist/typings/types';
import { jsLogger, type Logger } from '@map-colonies/js-logger';
import { type InjectionObject, registerDependencies } from '@common/dependencyRegistration';
import { SERVICES, SERVICE_NAME } from '@common/constants';
import { getTracing } from '@common/tracing';
import { type ConfigType, getConfig } from '@common/config';
import { DERIVATION_CONFIG, getDerivationConfig } from '@common/derivationConfig';
import { getTierConfig, TIER_CONFIG } from '@common/tierConfig';
import { snapshotRouterFactory, SNAPSHOT_ROUTER_SYMBOL } from './snapshot/routes/snapshotRouter';
import { PR_PROVIDER, type PrProvider } from './providers/prProvider';
import { FixturePrProvider } from './providers/fixture/fixturePrProvider';
import { createGithubPrProvider } from './providers/github/githubPrProvider';
import { SNAPSHOT_STORE } from './cache/snapshotStore';
import { InMemorySnapshotStore } from './cache/inMemorySnapshotStore';
import { SYNC_LOOP, SyncLoop } from './sync/syncLoop';
import { createSyncMetrics, SYNC_METRICS, type SyncMetrics } from './sync/syncMetrics';

function createPrProvider(container: DependencyContainer): PrProvider {
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  switch (config.get('provider')) {
    case 'fixture':
      return new FixturePrProvider(config.get('team.slug'));
    case 'github':
      return createGithubPrProvider({
        teamSlug: config.get('team.slug'),
        githubToken: config.get('githubToken'),
        githubApp: config.get('githubApp'),
        logger: container.resolve<Logger>(SERVICES.LOGGER),
        metrics: container.resolve<SyncMetrics>(SYNC_METRICS),
      });
  }
}

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const configInstance = getConfig();

  const loggerConfig = configInstance.get('telemetry.logger');

  const logger = await jsLogger({ ...loggerConfig, prettyPrint: loggerConfig.prettyPrint, mixin: getOtelMixin() });

  const tracer = trace.getTracer(SERVICE_NAME);
  const metricsRegistry = new Registry();
  configInstance.initializeMetrics(metricsRegistry);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: configInstance } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.METRICS, provider: { useValue: metricsRegistry } },
    { token: DERIVATION_CONFIG, provider: { useValue: getDerivationConfig(configInstance) } },
    { token: TIER_CONFIG, provider: { useValue: getTierConfig(configInstance) } },
    { token: SYNC_METRICS, provider: { useValue: createSyncMetrics(metricsRegistry) } },
    { token: SNAPSHOT_STORE, provider: { useValue: new InMemorySnapshotStore() } },
    { token: PR_PROVIDER, provider: { useFactory: instanceCachingFactory(createPrProvider) } },
    { token: SYNC_LOOP, provider: { useFactory: instanceCachingFactory((container) => container.resolve(SyncLoop)) } },
    { token: SNAPSHOT_ROUTER_SYMBOL, provider: { useFactory: snapshotRouterFactory } },
    {
      token: 'onSignal',
      provider: {
        useFactory: (container) => async (): Promise<void> => {
          container.resolve<SyncLoop>(SYNC_LOOP).stop();
          await Promise.all([getTracing().stop()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
