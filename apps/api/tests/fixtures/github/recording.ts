// Shared by the recorder and the tests that replay its recording.

import path from 'node:path';

export const RECORDING_DIR = path.join(__dirname, 'recording');

/** The recording reads details a few PRs at a time, so its handful of PRs spans two batches. */
export const RECORDED_BATCH_SIZE = 4;

/** Names the file a search's response is recorded in, by which of the sweep's searches it is. */
export function searchFixtureName(query: string): string {
  if (query.includes('team-review-requested:')) {
    return 'search-team-requests';
  }
  return query.includes('repo:') ? 'search-team-repos' : 'search-team-members';
}

/** The fixture files of the queries that read nodes by id, by operation. */
export const NODES_FIXTURE_PREFIXES: Record<string, string> = {
  /* eslint-disable @typescript-eslint/naming-convention -- the operations' names */
  PullRequestDetails: 'details',
  ReviewThreads: 'threads',
  ReviewTeams: 'review-teams',
  /* eslint-enable @typescript-eslint/naming-convention */
};
