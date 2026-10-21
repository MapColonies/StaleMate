import type { PrFacts, Roster } from '@domain/facts';
import type { Discovery, PrProvider } from '@src/providers/prProvider';
import { FixturePrProvider } from '@src/providers/fixture/fixturePrProvider';

/**
 * Serves the fixtures, or fails or waits when a test tells it to. A test can also change what the code host holds:
 * the Roster, which PRs are open, and when a PR last changed.
 */
export class ScriptedProvider implements PrProvider {
  /** How many sweeps started, each with a discovery. */
  public sweeps = 0;
  /** The ids each read asked for, in order. */
  public readonly reads: string[][] = [];
  /** Thrown by every discovery and read while set. */
  public failure: Error | undefined = undefined;
  /** Replaces the fixtures' Roster while set. */
  public roster: Roster | undefined = undefined;
  private readonly fixture = new FixturePrProvider('infra');
  /** PRs a test opened, or put in place of a fixture's PR of the same id. */
  private readonly added = new Map<string, { facts: PrFacts; updatedAt: Date }>();
  private readonly removed = new Set<string>();
  private readonly touchedAt = new Map<string, Date>();
  private gate: Promise<void> | undefined;

  public async discover(): Promise<Discovery> {
    this.sweeps++;
    await this.proceed();
    const fixture = await this.fixture.discover();
    const added = [...this.added.values()].map(({ facts, updatedAt }) => ({ id: facts.id, updatedAt }));
    const prs = [...fixture.prs.filter((pr) => !this.added.has(pr.id)), ...added]
      .filter((pr) => !this.removed.has(pr.id))
      .map((pr) => ({ ...pr, updatedAt: this.touchedAt.get(pr.id) ?? pr.updatedAt }));
    return { roster: this.roster ?? fixture.roster, prs };
  }

  public async read(ids: readonly string[]): Promise<PrFacts[]> {
    this.reads.push([...ids]);
    await this.proceed();
    const fixture = new Map((await this.fixture.read(ids)).map((facts) => [facts.id, facts]));
    return ids.filter((id) => !this.removed.has(id)).flatMap((id) => this.added.get(id)?.facts ?? fixture.get(id) ?? []);
  }

  /** Opens a PR, last changed at updatedAt, or replaces the open PR of the same id. */
  public add(facts: PrFacts, updatedAt: Date): void {
    this.removed.delete(facts.id);
    this.touchedAt.delete(facts.id);
    this.added.set(facts.id, { facts, updatedAt });
  }

  /** Closes a PR, so it is neither discovered nor read. */
  public remove(id: string): void {
    this.removed.add(id);
  }

  /** Says a PR last changed at updatedAt, as when someone acts on it. */
  public touch(id: string, updatedAt: Date): void {
    this.touchedAt.set(id, updatedAt);
  }

  /** Holds every discovery and read until the returned function is called. */
  public hold(): () => void {
    let release = (): void => undefined;
    this.gate = new Promise((resolve) => {
      release = (): void => {
        this.gate = undefined;
        resolve();
      };
    });
    return release;
  }

  /** Waits while held, then fails if a test said to. */
  private async proceed(): Promise<void> {
    await this.gate;
    if (this.failure !== undefined) {
      throw this.failure;
    }
  }
}
