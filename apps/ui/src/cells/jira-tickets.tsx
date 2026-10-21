import { ExternalLink } from 'lucide-react';
import type { TrackedPr } from '@/snapshot/types';

const NO_TICKET = 'No Jira ticket';

/**
 * Links the PR's first Jira Ticket to Jira, folding the rest into +N with their keys on hover, or says it has none.
 * `compact` says none with a dash, for a narrow column. Without a Jira site it shows nothing.
 */
export function JiraTickets({
  pr,
  jiraBaseUrl,
  compact = false,
}: {
  pr: Pick<TrackedPr, 'jiraTickets'>;
  jiraBaseUrl: string | undefined;
  compact?: boolean;
}) {
  if (jiraBaseUrl === undefined) {
    return null;
  }
  const [first, ...rest] = pr.jiraTickets;
  if (first === undefined) {
    return (
      <span title={NO_TICKET} className="text-xs whitespace-nowrap text-muted-foreground/70">
        {compact ? '—' : 'No ticket'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs whitespace-nowrap text-muted-foreground">
      <a
        href={`${jiraBaseUrl}/browse/${first}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
      >
        {first}
        <ExternalLink aria-hidden className="size-3" />
      </a>
      {rest.length > 0 && <span title={`Also ${rest.join(', ')}`}>+{rest.length}</span>}
    </span>
  );
}
