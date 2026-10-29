import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { MoveList } from '@/cells';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatSince } from '@/lib/time';
import { type Notification, type PrSummary, withPrs } from '@/notifications/engine';
import { sendTestPopUp } from '@/notifications/pop-up';
import type { OsNotifications } from '@/notifications/use-os-notifications';
import type { TrackedPr } from '@/snapshot/types';
import { NotificationBell } from './notification-bell';

function NotificationRow({
  notification,
  pr,
  now,
  onDismiss,
}: {
  notification: Notification;
  pr: PrSummary & { id: string };
  now: number;
  onDismiss: () => void;
}) {
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
        {!notification.onYou && (
          <>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap font-medium">no longer on you</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span className="whitespace-nowrap">noticed {formatSince(new Date(notification.noticedAt).toISOString(), now)} ago</span>
      </div>
    </li>
  );
}

/** The footer, with the checkbox that also sends Notifications to the OS. Hidden when the browser has no Notification API. */
function OsNotificationsFooter({ os: { permission, enabled, setEnabled } }: { os: OsNotifications }) {
  const hintId = useId();
  const [testFailure, setTestFailure] = useState<string>();
  if (permission === 'unsupported') {
    return null;
  }
  const blocked = permission === 'denied';
  return (
    <SheetFooter className="border-t">
      <label className="flex items-center gap-2 text-sm has-disabled:text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={enabled}
          disabled={blocked}
          aria-describedby={blocked ? hintId : undefined}
          onChange={(event) => void setEnabled(event.target.checked)}
        />
        Also send them to my OS
      </label>
      {blocked && (
        <p id={hintId} className="text-xs text-muted-foreground">
          This browser blocks StaleMate’s notifications. Allow them from the padlock in the address bar.
        </p>
      )}
      <button
        type="button"
        className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setTestFailure(sendTestPopUp())}
      >
        Send a test notification
      </button>
      {testFailure !== undefined && (
        <p role="status" className="text-xs text-muted-foreground">
          {testFailure}
        </p>
      )}
    </SheetFooter>
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
  open,
  onOpenChange,
  os,
  onDismiss,
  onOpenInbox,
}: {
  notifications: readonly Notification[];
  prs: readonly TrackedPr[];
  hasViewer: boolean;
  now: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  os: OsNotifications;
  onDismiss: (prIds: readonly string[]) => void;
  onOpenInbox: () => void;
}) {
  // The bell counts these rows too, so it can never disagree with the drawer.
  const rows = withPrs(notifications, prs);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
                onOpenChange(false);
                onOpenInbox();
              }}
            >
              See what’s still on you in the Inbox’s Your turn
            </Button>
          </div>
        )}
        <OsNotificationsFooter os={os} />
      </SheetContent>
    </Sheet>
  );
}
