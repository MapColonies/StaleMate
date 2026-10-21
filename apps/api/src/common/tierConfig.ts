import type { ConfigType } from './config';

/** The Tiers sweeps re-read Tracked PRs by. Hot PRs, idle under warmFromWorkingDays, are re-read every sweep. */
export interface TierConfig {
  /** The Idle Time in Working Days from which a PR is Warm. */
  warmFromWorkingDays: number;
  /** The Idle Time in Working Days from which a PR is Cold. */
  coldFromWorkingDays: number;
  /** How long after a Warm PR was read before a sweep re-reads it. */
  warmReadIntervalMs: number;
  /** How long after a Cold PR was read before a sweep re-reads it. */
  coldReadIntervalMs: number;
}

/** Reads the Tiers from the config, once, rejecting Tiers out of order, which the config schema can't express. */
export function getTierConfig(config: ConfigType): TierConfig {
  const tiers = config.get('sync.tiers');
  if (tiers.coldFromWorkingDays < tiers.warmFromWorkingDays) {
    throw new Error('sync.tiers.coldFromWorkingDays must be at least sync.tiers.warmFromWorkingDays');
  }
  if (tiers.coldReadIntervalMs < tiers.warmReadIntervalMs) {
    throw new Error('sync.tiers.coldReadIntervalMs must be at least sync.tiers.warmReadIntervalMs');
  }
  return tiers;
}

export const TIER_CONFIG = Symbol('TierConfig');
