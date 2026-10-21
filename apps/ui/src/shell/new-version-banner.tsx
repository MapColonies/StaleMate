import { RotateCw } from 'lucide-react';
import { RUNNING_VERSION, useNewVersionDeployed } from './use-new-version-deployed';

/**
 * Asks the Viewer to reload once another version is deployed. It can't be dismissed. Blue, never red or amber: nothing
 * is broken or behind yet.
 */
export function NewVersionBanner() {
  if (!useNewVersionDeployed()) {
    return null;
  }
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-blue-300 bg-blue-50 px-5 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
    >
      <RotateCw className="size-4 shrink-0" />A new version of StaleMate is available —{' '}
      <button
        type="button"
        title={`You’re on v${RUNNING_VERSION}`}
        onClick={() => window.location.reload()}
        className="font-medium underline underline-offset-2 hover:no-underline"
      >
        Reload
      </button>
    </div>
  );
}
