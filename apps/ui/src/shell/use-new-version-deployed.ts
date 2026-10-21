import { useQuery } from '@tanstack/react-query';

const CHECK_MS = 5 * 60_000;

/** The release this bundle was built from, compiled in by Vite. */
export const RUNNING_VERSION = __APP_VERSION__;

/**
 * Whether `deployed`, the parsed version.json, names a version other than the running one. Any difference counts, so a
 * rollback does too. Anything malformed is no news.
 */
export function isNewVersion(deployed: unknown, running: string): boolean {
  if (typeof deployed !== 'object' || deployed === null) {
    return false;
  }
  const { version } = deployed as { version?: unknown };
  return typeof version === 'string' && version !== '' && version !== running;
}

async function fetchDeployedVersion(): Promise<unknown> {
  // From the UI's own host, not the API: the UI and API pods roll out separately.
  const response = await fetch(new Request('/version.json'));
  if (!response.ok) {
    throw new Error(`version.json answered ${response.status}`);
  }
  return response.json();
}

/**
 * Whether a version other than the running one is deployed, checked every 5 minutes and when the window regains focus.
 * A tab in the background doesn't check. A missing, malformed or failed version.json is no news.
 */
export function useNewVersionDeployed(): boolean {
  const { data } = useQuery({
    queryKey: ['version.json'],
    queryFn: fetchDeployedVersion,
    refetchInterval: CHECK_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return isNewVersion(data, RUNNING_VERSION);
}
