import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import 'jest-extended';
import { getConfig, initConfig } from '@common/config';

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
      expect(config.get('sync.intervalMs')).toBePositive();
      expect(config.get('sync.refreshCooldownMs')).toBePositive();
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
      vi.stubEnv('SYNC_INTERVAL_MS', '60000');
      vi.stubEnv('SYNC_REFRESH_COOLDOWN_MS', '10000');
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
      expect(config.get('sync.intervalMs')).toBe(60000);
      expect(config.get('sync.refreshCooldownMs')).toBe(10000);
      expect(config.get('provider')).toBe('github');
      expect(config.get('githubApp')).toStrictEqual({
        appId: 123,
        installationId: 456,
        privateKeyPath: '/etc/stalemate/github-app/private-key.pem',
      });
    });
  });
});
