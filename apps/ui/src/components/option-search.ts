/** How many values a list of options needs before it gets a search box: the filter bar's menus and the Inbox's facets. */
export const SEARCH_FROM = 9;

/** The search box over a list of options. */
export const SEARCH_INPUT_CLASS =
  'mb-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Whether an option's text holds the query, ignoring case and the spaces around the query. A blank query holds everything. */
export function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}
