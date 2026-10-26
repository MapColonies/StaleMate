import { STORAGE_KEYS } from '@/lib/local-storage';
import { useRememberedParam } from '@/lib/remembered-param';

const parseGroup = (value: string | null): boolean | null => (value === 'on' ? true : value === 'off' ? false : null);
const formatGroup = (group: boolean): string => (group ? 'on' : 'off');

/**
 * Whether a Stack's PRs are grouped together. On by default. The URL's wins, then the Viewer's saved choice
 * (see useRememberedParam).
 */
export function useGroupStacks(): [boolean, (group: boolean) => void] {
  const [group, setGroup] = useRememberedParam({
    param: 'group',
    storageKey: STORAGE_KEYS.groupStacks,
    parse: parseGroup,
    format: formatGroup,
    fallback: true,
  });
  return [group, setGroup];
}
