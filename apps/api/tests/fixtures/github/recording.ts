// Shared by the recorder and the tests that replay its recording.

import path from 'node:path';

function searchKind(query: string): string {
  if (query.includes('team-review-requested:')) {
    return 'search-team-requests';
  }
  return query.includes('repo:') ? 'search-team-repos' : 'search-team-members';
}

export const RECORDING_DIR = path.join(__dirname, 'recording');

/** The recording reads details a few PRs at a time, so its handful of PRs spans two batches. */
export const RECORDED_BATCH_SIZE = 4;

/**
 * Names the file each search's response is recorded in: its kind, then its place among the searches of that kind.
 * A sweep over several Teams batches a kind into several searches, which run in the same order every time, so a replay
 * with its own instance names them the same way.
 */
export class SearchFixtureNames {
  private readonly counts = new Map<string, number>();

  public next(query: string): string {
    const kind = searchKind(query);
    const count = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, count);
    return `${kind}-${count}`;
  }
}

/** The fixture files of the queries that read nodes by id, by operation. */
export const NODES_FIXTURE_PREFIXES: Record<string, string> = {
  /* eslint-disable @typescript-eslint/naming-convention -- the operations' names */
  PullRequestDetails: 'details',
  ReviewThreads: 'threads',
  ReviewTeams: 'review-teams',
  /* eslint-enable @typescript-eslint/naming-convention */
};
