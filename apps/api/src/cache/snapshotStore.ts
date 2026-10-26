import type { PrFacts, WatchedTeam } from '@domain/facts';
import type { TeamFreePr, TeamPart } from '@domain/deriveTrackedPr';
import type { Person } from '@domain/trackedPr';

/** One Tracked PR as StaleMate last read it, derived except for the clocks. */
export interface PrRecord {
  facts: PrFacts;
  /** When its details were last read: the start of the sweep that read them. */
  readAt: Date;
  /** When the code host said the PR last changed, as of that read. */
  updatedAt: Date;
  /** What derives from the facts alone. */
  teamFree: TeamFreePr;
  /** What depends on the Team, by slug, for each Team that tracks the PR. Never empty: a PR no Team tracks is not stored. */
  perTeam: Record<string, TeamPart>;
}

/** A watched Team as `GET /teams` lists it. */
export interface TeamSummary {
  slug: string;
  name: string;
  members: Person[];
}

/** What the Snapshot holds besides its Tracked PRs. */
export interface SnapshotWide {
  /** Every watched Team's roster, in a stable order. */
  teams: WatchedTeam[];
  /** The watched Teams, sorted by display name, with their members classified. */
  teamList: TeamSummary[];
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
