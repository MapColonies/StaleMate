import { Router } from 'express';
import type { FactoryFunction } from 'tsyringe';
import { SnapshotController } from '../controllers/snapshotController';

const snapshotRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(SnapshotController);

  router.get('/teams', controller.getTeams);
  router.get('/snapshot', controller.getSnapshot);
  router.post('/refresh', controller.refresh);

  return router;
};

export const SNAPSHOT_ROUTER_SYMBOL = Symbol('snapshotRouterFactory');

export { snapshotRouterFactory };
