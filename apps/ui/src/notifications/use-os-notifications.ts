import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS, readStored, writeStored } from '@/lib/local-storage';

/** What the browser lets StaleMate do with OS notifications. 'unsupported' when it has no Notification API. */
export type OsPermission = NotificationPermission | 'unsupported';

const currentPermission = (): OsPermission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

const isOn = (): boolean => readStored(STORAGE_KEYS.osNotifications) === 'on';

export interface OsNotifications {
  permission: OsPermission;
  /**
   * The setting is on and the browser allows it, so Notifications go to the OS. Blocking them leaves the setting on, so
   * allowing them again turns it back on.
   */
  enabled: boolean;
  /** Turning it on asks for permission first, when the browser hasn't been asked yet. */
  setEnabled: (on: boolean) => Promise<void>;
}

/**
 * Whether new Notifications also go to the OS. One setting for the whole browser, not per Viewer. Permission is asked
 * only when the Viewer turns it on, and followed through the Permissions API where the browser has it, so allowing
 * notifications again in site settings takes effect without a reload.
 */
export function useOsNotifications(): OsNotifications {
  const [permission, setPermission] = useState(currentPermission);
  const [on, setOn] = useState(isOn);

  const supported = permission !== 'unsupported';
  useEffect(() => {
    if (!supported || navigator.permissions === undefined) {
      return;
    }
    let status: PermissionStatus | undefined;
    let cancelled = false;
    // The Permissions API says 'prompt' where Notification says 'default': read Notification's own word on each change.
    const onChange = (): void => setPermission(currentPermission());
    navigator.permissions.query({ name: 'notifications' }).then(
      (result) => {
        if (cancelled) {
          return;
        }
        status = result;
        status.addEventListener('change', onChange);
      },
      () => {
        // A browser that can't be asked about notifications: what Notification said at load stands.
      }
    );
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [supported]);

  // Turned on or off in another tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEYS.osNotifications) {
        setOn(isOn());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    if (next && currentPermission() === 'default') {
      try {
        setPermission(await Notification.requestPermission());
      } catch {
        // A browser that only takes the old callback form, or failed to ask: it stays off.
      }
    }
    const stored = next && currentPermission() === 'granted';
    writeStored(STORAGE_KEYS.osNotifications, stored ? 'on' : null);
    setOn(stored);
  }, []);

  return { permission, enabled: on && permission === 'granted', setEnabled };
}
