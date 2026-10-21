/**
 * Reads the PR's Jira Tickets: the keys of the configured Jira projects' issues its title names, in title order.
 * A key counts only as a whole word, so `XMAPCO-12` and `MAPCO-12a` name none.
 */
export function deriveJiraTickets(title: string, jiraProjectKeys: readonly string[]): string[] {
  if (jiraProjectKeys.length === 0) {
    return [];
  }
  const issueKey = new RegExp(`\\b(?:${jiraProjectKeys.join('|')})-\\d+\\b`, 'g');
  return [...new Set(title.match(issueKey))];
}
