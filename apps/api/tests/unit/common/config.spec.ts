import { beforeAll, describe, expect, it } from 'vitest';
import 'jest-extended';
import { getConfig, initConfig } from '@common/config';

describe('config', function () {
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
