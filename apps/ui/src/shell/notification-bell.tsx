import { Bell } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';

/**
 * The bell, with the Viewer's unread Notifications on it. Greyed out until the Viewer picks themselves. Other props go
 * to the button, so it can open the drawer.
 */
export function NotificationBell({ count, hasViewer, ...props }: { count: number; hasViewer: boolean } & ComponentProps<typeof Button>) {
  const label = count > 0 ? `Notifications: ${count} unread` : 'Notifications';
  return (
    <Button {...props} variant="ghost" size="icon" className="relative size-8" aria-label={label} title={label} disabled={!hasViewer}>
      <Bell className="size-4" />
      {count > 0 && (
        <span
          data-testid="notification-count"
          aria-hidden
          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Button>
  );
}
