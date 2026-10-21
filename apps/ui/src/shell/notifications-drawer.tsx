import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { MoveList } from '@/cells';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatSince } from '@/lib/time';
import type { Notification } from '@/notifications/engine';
import type { TrackedPr } from '@/snapshot/types';
import { NotificationBell } from './notification-bell';

function NotificationRow({ notification, pr, now, onDismiss }: { notification: Notification; pr: TrackedPr; now: number; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <li aria-labelledby={titleId} className="flex flex-col gap-1 border-b px-4 py-2.5">
      <div className="flex items-start gap-2">
        <a id={titleId} href={pr.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
          {pr.title}
        </a>
        <Button variant="ghost" size="icon-xs" aria-label={`Dismiss ${pr.title}`} onClick={onDismiss}>
          <X />
        </Button>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">
          {pr.repo}#{pr.number}
        </span>
        <span aria-hidden>·</span>
        <MoveList moves={notification.moves} />
        <span aria-hidden>·</span>
        <span className="whitespace-nowrap">noticed {formatSince(new Date(notification.noticedAt).toISOString(), now)} ago</span>
      </div>
    </li>
  );
}

/**
 * The bell, and the drawer it opens over the app: the Viewer's Notifications, to dismiss one by one or all at once.
 * Opening a PR from it leaves its Notification in place.
 */
export function NotificationsDrawer({
  notifications,
  prs,
  hasViewer,
  now,
  onDismiss,
  onOpenInbox,
}: {
  notifications: readonly Notification[];
  prs: readonly TrackedPr[];
  hasViewer: boolean;
  now: number;
  onDismiss: (prIds: readonly string[]) => void;
  onOpenInbox: () => void;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(prs.map((pr) => [pr.id, pr]));
  // A Notification is only kept while its PR is on the Viewer, so it is in the Snapshot. The bell counts these rows too,
  // so it can never disagree with the drawer.
  const rows = notifications.flatMap((notification) => {
    const pr = byId.get(notification.prId);
    return pr === undefined ? [] : [{ notification, pr }];
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* The hint sits on a wrapper: a disabled button gets no pointer events, so it would show no tooltip. */}
      <span title={hasViewer ? undefined : 'Pick yourself in “I am…” to get Notifications'}>
        <SheetTrigger asChild>
          <NotificationBell count={rows.length} hasViewer={hasViewer} />
        </SheetTrigger>
      </span>
      <SheetContent aria-describedby={undefined} className="gap-0">
        <SheetHeader className="flex-row items-center gap-2 border-b">
          <SheetTitle className="flex-1">Notifications</SheetTitle>
          <Button variant="ghost" size="sm" disabled={rows.length === 0} onClick={() => onDismiss(rows.map(({ pr }) => pr.id))}>
            Dismiss all
          </Button>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </SheetHeader>
        {rows.length > 0 ? (
          <ul className="min-h-0 flex-1 overflow-auto">
            {rows.map(({ notification, pr }) => (
              <NotificationRow key={pr.id} notification={notification} pr={pr} now={now} onDismiss={() => onDismiss([pr.id])} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-lg text-muted-foreground" aria-hidden>
              (˘ᵕ˘)
            </p>
            <p className="text-sm text-muted-foreground">Nothing new on you.</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setOpen(false);
                onOpenInbox();
              }}
            >
              See what’s still on you in the Inbox’s Your turn
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
