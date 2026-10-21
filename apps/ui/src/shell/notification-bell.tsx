import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The bell, with the Viewer's unread Notifications on it. Greyed out until the Viewer picks themselves. */
export function NotificationBell({ count, hasViewer }: { count: number; hasViewer: boolean }) {
  const label = count > 0 ? `Notifications: ${count} unread` : 'Notifications';
  // The hint sits on a wrapper: a disabled button gets no pointer events, so it would show no tooltip.
  return (
    <span title={hasViewer ? label : 'Pick yourself in “I am…” to get Notifications'}>
      <Button variant="ghost" size="icon" className="relative size-8" aria-label={label} disabled={!hasViewer}>
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
    </span>
  );
}
