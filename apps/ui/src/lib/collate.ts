/**
 * Orders names the way a person reads them, ignoring case and accents. One shared Collator: `localeCompare` with options builds a
 * new one for every comparison in some browsers, which is slow enough to matter inside a sort.
 */
export const byName: (a: string, b: string) => number = new Intl.Collator(undefined, { sensitivity: 'base' }).compare;
