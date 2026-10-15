// this import must be called before the first import of tsyringe
import 'reflect-metadata';
import type { Logger } from '@map-colonies/js-logger';
import { SERVICES } from './common/constants';
import { getApp } from './app';
import type { ConfigType } from './common/config';
import { createHttpServer } from './httpServer';
import { SYNC_LOOP, type SyncLoop } from './sync/syncLoop';

void getApp()
  .then(([app, container]) => {
    const config = container.resolve<ConfigType>(SERVICES.CONFIG);
    const port: number = config.get('server.port');
    const logger = container.resolve<Logger>(SERVICES.LOGGER);
    const server = createHttpServer(app, container);

    server.listen(port, () => {
      logger.info(`app started on port ${port}`);
      void container.resolve<SyncLoop>(SYNC_LOOP).start();
    });
  })
  .catch((error: Error) => {
    console.error('😢 - failed initializing the server');
    console.error(error);
    process.exit(1);
  });
