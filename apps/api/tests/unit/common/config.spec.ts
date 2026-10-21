import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import 'jest-extended';
import { getConfig, initConfig } from '@common/config';
import { getTierConfig } from '@common/tierConfig';

describe('config', function () {
  describe('defaults', function () {
    beforeAll(async function () {
      await initConfig(true);
    });

    it('should validate the in-repo defaults offline', function () {
      const config = getConfig();

      expect(config.get('team.slug')).toBeString();
      expect(config.get('bots.logins')).toBeArray();
      expect(config.get('extraNonWorkingDays')).toBeArray();
      expect(config.get('urgency.thresholds')).toHaveLength(3);
      expect(config.get('checks.excluded')).toStrictEqual(['jira/issue-validation', 'jira-validation']);
      expect(config.get('jira.baseUrl')).toBe('https://mapcolonies.atlassian.net');
      expect(config.get('jira.projectKeys')).toStrictEqual(['MAPCO']);
      expect(config.get('sync.intervalMs')).toBePositive();
      expect(config.get('sync.refreshCooldownMs')).toBePositive();
      expect(getTierConfig(config)).toStrictEqual({
        warmFromWorkingDays: 10,
        coldFromWorkingDays: 60,
        warmReadIntervalMs: 15 * 60_000,
        coldReadIntervalMs: 60 * 60_000,
      });
      expect(['github', 'fixture']).toContain(config.get('provider'));
      expect(config.get('githubApp')).toBeObject();
      expect(config.get('server.port')).toBePositive();
    });
  });

  // The helm chart renders every setting into the API's environment.
  describe('from the environment', function () {
    afterEach(function () {
      vi.unstubAllEnvs();
    });

    it('should read every setting the chart renders', async function () {
      vi.stubEnv('TEAM_SLUG', 'avengers');
      vi.stubEnv('BOTS_LOGINS', '["jarvis","friday"]');
      vi.stubEnv('EXTRA_NON_WORKING_DAYS', '["2026-11-03"]');
      vi.stubEnv('URGENCY_THRESHOLDS', '[1,3,5]');
      vi.stubEnv('EXCLUDED_CHECKS', '["lint"]');
      vi.stubEnv('JIRA_BASE_URL', 'https://avengers.atlassian.net');
      vi.stubEnv('JIRA_PROJECT_KEYS', '["SHIELD","HYDRA"]');
      vi.stubEnv('SYNC_INTERVAL_MS', '60000');
      vi.stubEnv('SYNC_REFRESH_COOLDOWN_MS', '10000');
      vi.stubEnv('SYNC_TIERS_WARM_FROM_WORKING_DAYS', '5');
      vi.stubEnv('SYNC_TIERS_COLD_FROM_WORKING_DAYS', '40');
      vi.stubEnv('SYNC_TIERS_WARM_READ_INTERVAL_MS', '600000');
      vi.stubEnv('SYNC_TIERS_COLD_READ_INTERVAL_MS', '1800000');
      vi.stubEnv('PROVIDER', 'github');
      vi.stubEnv('GITHUB_APP_ID', '123');
      vi.stubEnv('GITHUB_APP_INSTALLATION_ID', '456');
      vi.stubEnv('GITHUB_APP_PRIVATE_KEY_PATH', '/etc/stalemate/github-app/private-key.pem');

      await initConfig(true);
      const config = getConfig();

      expect(config.get('team.slug')).toBe('avengers');
      expect(config.get('bots.logins')).toStrictEqual(['jarvis', 'friday']);
      expect(config.get('extraNonWorkingDays')).toStrictEqual(['2026-11-03']);
      expect(config.get('urgency.thresholds')).toStrictEqual([1, 3, 5]);
      expect(config.get('checks.excluded')).toStrictEqual(['lint']);
      expect(config.get('jira.baseUrl')).toBe('https://avengers.atlassian.net');
      expect(config.get('jira.projectKeys')).toStrictEqual(['SHIELD', 'HYDRA']);
      expect(config.get('sync.intervalMs')).toBe(60000);
      expect(config.get('sync.refreshCooldownMs')).toBe(10000);
      expect(config.get('sync.tiers')).toStrictEqual({
        warmFromWorkingDays: 5,
        coldFromWorkingDays: 40,
        warmReadIntervalMs: 600000,
        coldReadIntervalMs: 1800000,
      });
      expect(config.get('provider')).toBe('github');
      expect(config.get('githubApp')).toStrictEqual({
        appId: 123,
        installationId: 456,
        privateKeyPath: '/etc/stalemate/github-app/private-key.pem',
      });
    });
  });

  describe('tiers', function () {
    afterEach(async function () {
      vi.unstubAllEnvs();
      await initConfig(true);
    });

    it.each([
      ['SYNC_TIERS_WARM_FROM_WORKING_DAYS', '-1'],
      ['SYNC_TIERS_COLD_READ_INTERVAL_MS', '-1'],
    ])('should reject %s=%s', async function (name, value) {
      vi.stubEnv(name, value);

      await expect(initConfig(true)).rejects.toThrow();
    });

    it('should reject a Cold tier that starts before the Warm one', async function () {
      vi.stubEnv('SYNC_TIERS_WARM_FROM_WORKING_DAYS', '20');
      vi.stubEnv('SYNC_TIERS_COLD_FROM_WORKING_DAYS', '10');
      await initConfig(true);

      expect(() => getTierConfig(getConfig())).toThrow('coldFromWorkingDays');
    });

    it('should reject a Cold tier re-read more often than the Warm one', async function () {
      vi.stubEnv('SYNC_TIERS_WARM_READ_INTERVAL_MS', '3600000');
      vi.stubEnv('SYNC_TIERS_COLD_READ_INTERVAL_MS', '900000');
      await initConfig(true);

      expect(() => getTierConfig(getConfig())).toThrow('coldReadIntervalMs');
    });
  });
});
