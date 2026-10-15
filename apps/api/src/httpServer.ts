import { createServer, type Server } from 'node:http';
import { createTerminus } from '@godaddy/terminus';
import type { Application } from 'express';
import type { DependencyContainer } from 'tsyringe';
import { SNAPSHOT_STORE, type SnapshotStore } from './cache/snapshotStore';

/** Wraps the app with the probes. Readiness passes once a Snapshot exists; a failed sweep never touches either probe. */
export function createHttpServer(app: Application, container: DependencyContainer): Server {
  const store = container.resolve<SnapshotStore>(SNAPSHOT_STORE);
  const liveness = async (): Promise<void> => Promise.resolve();
  const readiness = async (): Promise<void> => {
    if ((await store.get()) === undefined) {
      throw new Error('no sweep has succeeded yet');
    }
  };

  return createTerminus(createServer(app), {
    healthChecks: { '/liveness': liveness, '/readiness': readiness },
    onSignal: container.resolve('onSignal'),
  });
}
