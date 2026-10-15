import type { PrProvider, SweepResult } from '@src/providers/prProvider';
import { FixturePrProvider } from '@src/providers/fixture/fixturePrProvider';

/** Sweeps the fixtures, or fails or waits when a test tells it to. */
export class ScriptedProvider implements PrProvider {
  public sweeps = 0;
  /** Thrown by every sweep while set. */
  public failure: Error | undefined = undefined;
  private readonly fixture = new FixturePrProvider('infra');
  private gate: Promise<void> | undefined;

  public async sweep(): Promise<SweepResult> {
    this.sweeps++;
    await this.gate;
    if (this.failure !== undefined) {
      throw this.failure;
    }
    return this.fixture.sweep();
  }

  /** Holds every sweep until the returned function is called. */
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
}
