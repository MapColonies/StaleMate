import type { Discovery, PrProvider, SweepResult } from '@src/providers/prProvider';

/** Sweeps as the sync loop does: discovers, then reads every PR discovered. */
export async function sweep(provider: PrProvider): Promise<SweepResult & { discovery: Discovery }> {
  const discovery = await provider.discover();
  return { discovery, teams: discovery.teams, prs: await provider.read(discovery.prs.map((pr) => pr.id)) };
}
