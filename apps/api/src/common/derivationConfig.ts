import type { DerivationConfig } from '@domain/deriveTrackedPr';
import type { ConfigType } from './config';

/** Reads the derivation rules' settings from the config, once, for the sweep and the Snapshot to share. */
export function getDerivationConfig(config: ConfigType): DerivationConfig {
  return {
    teamSlug: config.get('team.slug'),
    botLogins: config.get('bots.logins'),
    // The config schema pins exactly three thresholds.
    urgencyThresholds: config.get('urgency.thresholds') as unknown as DerivationConfig['urgencyThresholds'],
    extraNonWorkingDays: config.get('extraNonWorkingDays'),
    excludedChecks: config.get('checks.excluded'),
    jiraProjectKeys: config.get('jira.projectKeys'),
  };
}

export const DERIVATION_CONFIG = Symbol('DerivationConfig');
