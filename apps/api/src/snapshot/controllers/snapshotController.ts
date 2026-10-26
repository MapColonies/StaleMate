import httpStatus from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import type { TypedRequestHandlers } from 'stalemate-openapi';
import { SnapshotManager } from '../models/snapshotManager';

/** Serves the Teams, the Snapshot's slices and takes "Refresh now" requests. */
@injectable()
export class SnapshotController {
  public constructor(@inject(SnapshotManager) private readonly manager: SnapshotManager) {}

  public getSnapshot: TypedRequestHandlers['getSnapshot'] = async (req, res, next) => {
    try {
      const result = await this.manager.getSnapshot(req.query.team);
      if (result.status === 'unknown') {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'unknown team' });
      }
      if (result.status === 'warming') {
        // Warming lasts only until the first sweep lands, so no one keeps it.
        return res.status(httpStatus.SERVICE_UNAVAILABLE).set('Cache-Control', 'no-store').json(result);
      }
      // no-cache: the browser keeps the body but asks every time, so an unchanged Snapshot costs a 304.
      res.status(httpStatus.OK).set('ETag', result.etag).set('Cache-Control', 'no-cache');
      if (req.fresh) {
        return res.status(httpStatus.NOT_MODIFIED).end();
      }
      // The body is already serialized, so it is written as is rather than through the typed send.
      return res.type('json').end(result.body);
    } catch (error) {
      next(error);
    }
  };

  public getTeams: TypedRequestHandlers['getTeams'] = async (_req, res, next) => {
    try {
      const result = await this.manager.getTeams();
      if (result.status === 'warming') {
        return res.status(httpStatus.SERVICE_UNAVAILABLE).set('Cache-Control', 'no-store').json(result);
      }
      return res.status(httpStatus.OK).json(result.teams);
    } catch (error) {
      next(error);
    }
  };

  public refresh: TypedRequestHandlers['refresh'] = (_req, res) => {
    return res.status(httpStatus.ACCEPTED).json(this.manager.refresh());
  };
}
