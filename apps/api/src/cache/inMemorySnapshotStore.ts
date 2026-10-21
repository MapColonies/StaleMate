import type { PrRecord, SnapshotStore, SnapshotWide, VersionedSnapshotWide } from './snapshotStore';

/** Keeps the Snapshot in the process, which is enough for the single replica. */
export class InMemorySnapshotStore implements SnapshotStore {
  private readonly records = new Map<string, PrRecord>();
  private snapshotWide: SnapshotWide | undefined;
  private version = 0;

  public async getRecords(): Promise<PrRecord[]> {
    return Promise.resolve([...this.records.values()]);
  }

  public async getSnapshotWide(): Promise<VersionedSnapshotWide | undefined> {
    return Promise.resolve(this.snapshotWide && { ...this.snapshotWide, version: this.version });
  }

  public async upsert(records: readonly PrRecord[]): Promise<void> {
    records.forEach((record) => this.records.set(record.facts.id, record));
    if (records.length > 0) {
      this.version++;
    }
    return Promise.resolve();
  }

  public async delete(ids: readonly string[]): Promise<void> {
    const deleted = ids.filter((id) => this.records.delete(id));
    if (deleted.length > 0) {
      this.version++;
    }
    return Promise.resolve();
  }

  public async setSnapshotWide(values: SnapshotWide): Promise<void> {
    this.snapshotWide = values;
    this.version++;
    return Promise.resolve();
  }
}
