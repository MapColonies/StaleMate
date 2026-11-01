import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ThemePreference } from './use-theme';

const THEMES: Record<ThemePreference, { name: string; Icon: typeof Sun }> = {
  system: { name: 'System', Icon: Monitor },
  light: { name: 'Light', Icon: Sun },
  dark: { name: 'Dark', Icon: Moon },
};

/** Cycles system → light → dark: an icon, or, `named`, the icon with the theme's name beside it. */
export function ThemeToggle({ preference, onCycle, named = false }: { preference: ThemePreference; onCycle: () => void; named?: boolean }) {
  const { name, Icon } = THEMES[preference];
  const label = `Theme: ${name}`;
  if (named) {
    return (
      <Button variant="outline" size="sm" aria-label={label} onClick={onCycle}>
        <Icon />
        {name}
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="icon" className="size-8" aria-label={label} title={label} onClick={onCycle}>
      <Icon className="size-4" />
    </Button>
  );
}
