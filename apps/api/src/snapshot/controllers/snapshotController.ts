import httpStatus from 'http-status-codes';
import { injectable } from 'tsyringe';
import type { TypedRequestHandlers } from 'stalemate-openapi';

/**
 * Serves the Snapshot and takes "Refresh now" requests.
 *
 * Until #18 (Serve the Snapshot from the fixture provider) adds the sync loop, nothing ever sweeps:
 * the Snapshot stays warming and refresh reports an idle sync.
 */
@injectable()
export class SnapshotController {
  public getSnapshot: TypedRequestHandlers['getSnapshot'] = (_req, res) => {
    return res.status(httpStatus.SERVICE_UNAVAILABLE).json({ status: 'warming', sync: { state: 'idle' } });
  };

  public refresh: TypedRequestHandlers['refresh'] = (_req, res) => {
    return res.status(httpStatus.ACCEPTED).json({ state: 'idle' });
  };
}
