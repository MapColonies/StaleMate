import type { PrFacts, Roster } from '@domain/facts';
import type { ClockFreePr } from '@domain/deriveTrackedPr';
import type { Person } from '@domain/trackedPr';

/** One Tracked PR as StaleMate last read it, derived except for the clocks. */
export interface PrRecord {
  facts: PrFacts;
  /** When its details were last read: the start of the sweep that read them. */
  readAt: Date;
  /** When the code host said the PR last changed, as of that read. */
  updatedAt: Date;
  derived: ClockFreePr;
}

/** What the Snapshot holds besides its Tracked PRs. */
export interface SnapshotWide {
  roster: Roster;
  /** The Roster's members, classified. */
  team: Person[];
  /** When the last successful sweep started. */
  readAt: Date;
}

export interface VersionedSnapshotWide extends SnapshotWide {
  /** Changes with every write to the store. */
  version: number;
}

/**
 * Holds the Snapshot keyed by PR, so a shared cache can replace the in-memory one without touching sweeps or derivation.
 * Every write changes the version, so whatever is built from the store can be keyed on it.
 */
export interface SnapshotStore {
  /** Every Tracked PR's record. */
  getRecords: () => Promise<PrRecord[]>;
  /** Undefined until the first sweep succeeds. */
  getSnapshotWide: () => Promise<VersionedSnapshotWide | undefined>;
  /** Adds the records, or replaces those of the same PR. */
  upsert: (records: readonly PrRecord[]) => Promise<void>;
  /** Removes the records of these PRs. */
  delete: (ids: readonly string[]) => Promise<void>;
  setSnapshotWide: (values: SnapshotWide) => Promise<void>;
}

export const SNAPSHOT_STORE = Symbol('SnapshotStore');
