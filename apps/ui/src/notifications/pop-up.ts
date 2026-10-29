import { MOVE_LABELS } from '@/cells/labels';
import type { TrackedPr } from '@/snapshot/types';
import { type Notification as ViewerNotification, withPrs } from './engine';

/** Why a test popup didn't go out, in words for the Viewer; undefined when it was sent. */
export function sendTestPopUp(): string | undefined {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    return 'Notifications haven’t been allowed yet. Tick “Also send them to my OS” first.';
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return 'The browser hasn’t allowed StaleMate’s notifications, so nothing was shown.';
  }
  try {
    new Notification('StaleMate test notification', { body: 'If you can see this, OS notifications work.', tag: 'stalemate.test' });
    return undefined;
  } catch {
    return 'The browser refused to show it. Check your OS’s notification or focus settings.';
  }
}

/** More newly due than this in one pass fire one summary instead, so the OS isn't spammed. */
const MAX_POPUPS = 3;

/**
 * Sends Notifications newly due to the OS: one per PR, tagged by PR so several tabs never show the same one twice, or
 * one summary when there are more than MAX_POPUPS. Clicking one focuses the window and calls onClick.
 */
export function popUp(due: readonly ViewerNotification[], prs: readonly TrackedPr[], onClick: () => void): void {
  const shown = withPrs(due, prs);
  if (shown.length === 0) {
    return;
  }
  const popups =
    shown.length > MAX_POPUPS
      ? [{ title: `${shown.length} PRs are on you`, body: 'Open StaleMate to see them.', tag: 'stalemate.summary' }]
      : shown.map(({ notification, pr }) => ({
          title: pr.title,
          body: `${pr.repo}#${pr.number} · ${notification.moves.map((move) => MOVE_LABELS[move]).join(', ')}`,
          tag: `stalemate.pr.${pr.id}`,
        }));
  for (const { title, body, tag } of popups) {
    try {
      // A later Move on the same PR replaces its popup and alerts again, rather than silently. TypeScript's DOM types
      // lack renotify, which Chromium supports.
      const options: NotificationOptions & { renotify: boolean } = { body, tag, renotify: true };
      const popup = new Notification(title, options);
      popup.onclick = () => {
        window.focus();
        popup.close();
        onClick();
      };
    } catch {
      // Some browsers only allow notifications from a service worker; the bell still has them.
    }
  }
}
