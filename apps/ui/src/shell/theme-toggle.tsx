import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ThemePreference } from './use-theme';

const THEMES: Record<ThemePreference, { label: string; Icon: typeof Sun }> = {
  system: { label: 'Theme: follows the system', Icon: Monitor },
  light: { label: 'Theme: light', Icon: Sun },
  dark: { label: 'Theme: dark', Icon: Moon },
};

/** Cycles system → light → dark. */
export function ThemeToggle({ preference, onCycle }: { preference: ThemePreference; onCycle: () => void }) {
  const { label, Icon } = THEMES[preference];
  return (
    <Button variant="ghost" size="icon" className="size-8" aria-label={label} title={label} onClick={onCycle}>
      <Icon className="size-4" />
    </Button>
  );
}
