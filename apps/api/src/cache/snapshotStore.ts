import type { SweepResult } from '../providers/prProvider';

/** What one successful sweep read. Derivation runs at request time, so Age and Idle Time stay current. */
export interface StoredSnapshot extends SweepResult {
  /** When the code host was read. */
  readAt: Date;
}

/** Holds the latest Snapshot as one value, swapped whole after each successful sweep. */
export interface SnapshotStore {
  /** Undefined until the first sweep succeeds. */
  get: () => Promise<StoredSnapshot | undefined>;
  set: (snapshot: StoredSnapshot) => Promise<void>;
}
