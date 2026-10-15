import httpStatus from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import type { TypedRequestHandlers } from 'stalemate-openapi';
import { SnapshotManager } from '../models/snapshotManager';

/** Serves the Snapshot and takes "Refresh now" requests. */
@injectable()
export class SnapshotController {
  public constructor(@inject(SnapshotManager) private readonly manager: SnapshotManager) {}

  public getSnapshot: TypedRequestHandlers['getSnapshot'] = async (_req, res, next) => {
    try {
      const result = await this.manager.getSnapshot();
      if (result.status === 'warming') {
        return res.status(httpStatus.SERVICE_UNAVAILABLE).json(result);
      }
      return res.status(httpStatus.OK).json(result.snapshot);
    } catch (error) {
      next(error);
    }
  };

  public refresh: TypedRequestHandlers['refresh'] = (_req, res) => {
    return res.status(httpStatus.ACCEPTED).json(this.manager.refresh());
  };
}
