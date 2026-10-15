import type { SnapshotStore, StoredSnapshot } from './snapshotStore';

/** Keeps the Snapshot in the process, which is enough for the single replica. */
export class InMemorySnapshotStore implements SnapshotStore {
  private snapshot: StoredSnapshot | undefined;

  public async get(): Promise<StoredSnapshot | undefined> {
    return Promise.resolve(this.snapshot);
  }

  public async set(snapshot: StoredSnapshot): Promise<void> {
    this.snapshot = snapshot;
    return Promise.resolve();
  }
}
