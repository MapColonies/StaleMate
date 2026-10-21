import type { TierConfig } from '@common/tierConfig';
import type { DerivationConfig } from '@domain/deriveTrackedPr';
import { toWorkingDays, workingMsBetween } from '@domain/workingDays';
import type { DiscoveredPr } from '../providers/prProvider';
import type { PrRecord } from '../cache/snapshotStore';

type ReadPlanConfig = TierConfig & Pick<DerivationConfig, 'extraNonWorkingDays'>;

function tierOf(record: PrRecord, config: ReadPlanConfig, now: Date): Tier {
  // Idle Time ignores Bots, so a PR only Bots touch cools down like any idle PR.
  const idleDays = toWorkingDays(workingMsBetween(record.derived.clockStarts.lastActivityAt, now, config.extraNonWorkingDays));
  if (idleDays >= config.coldFromWorkingDays) {
    return 'cold';
  }
  return idleDays >= config.warmFromWorkingDays ? 'warm' : 'hot';
}

function isDue(record: PrRecord, tier: Tier, config: ReadPlanConfig, now: Date): boolean {
  const readIntervalMs: Record<Tier, number> = { hot: 0, warm: config.warmReadIntervalMs, cold: config.coldReadIntervalMs };
  return now.getTime() - record.readAt.getTime() >= readIntervalMs[tier];
}

/** How long a Tracked PR has idled: Hot PRs are re-read every sweep, Warm and Cold ones less often. */
export type Tier = 'hot' | 'warm' | 'cold';

/** Why a sweep reads a PR: it is new, it changed, or its Tier's interval since its last read has passed. */
export type ReadReason = 'new' | 'changed' | Tier;

/**
 * Chooses which discovered PRs a sweep starting at `now` reads, and why: every PR not yet stored,
 * every PR whose updatedAt moved since its last read, and every PR its Tier says is due. A Bot's change moves updatedAt too.
 */
export function planReads(
  discovered: readonly DiscoveredPr[],
  records: readonly PrRecord[],
  config: ReadPlanConfig,
  now: Date
): Map<string, ReadReason> {
  const recordsById = new Map(records.map((record) => [record.facts.id, record]));
  const plan = new Map<string, ReadReason>();
  for (const { id, updatedAt } of discovered) {
    const record = recordsById.get(id);
    if (record === undefined) {
      plan.set(id, 'new');
    } else if (record.updatedAt.getTime() !== updatedAt.getTime()) {
      plan.set(id, 'changed');
    } else {
      const tier = tierOf(record, config, now);
      if (isDue(record, tier, config, now)) {
        plan.set(id, tier);
      }
    }
  }
  return plan;
}
