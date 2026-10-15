import { readFile } from 'node:fs/promises';
import { createAppAuth } from '@octokit/auth-app';
import { request } from '@octokit/request';
import { StatusCodes } from 'http-status-codes';
import { SweepError } from '../prProvider';
import type { GetToken } from './graphqlClient';

/** A token GitHub refused, or a key it can't use, is an authentication failure. GitHub being down or unreachable is not. */
function toAuthError(error: unknown): SweepError {
  const status = (error as { status?: StatusCodes }).status;
  return new SweepError(status !== undefined && status >= StatusCodes.INTERNAL_SERVER_ERROR ? 'unreachable' : 'authentication', { cause: error });
}

export interface GithubAuthConfig {
  /** A personal token, used when githubApp.appId is not set. */
  githubToken?: string;
  githubApp: { appId?: number; installationId?: number; privateKeyPath?: string };
}

/**
 * Picks how StaleMate authenticates: as the GitHub App's installation when githubApp.appId is set, otherwise with githubToken.
 * The App's key is read on the first sweep, so a bad key fails sweeps, and the API never becomes ready, rather than crashing it.
 */
export function createGetToken(config: GithubAuthConfig, fetchImpl: typeof fetch): GetToken {
  const { appId, installationId, privateKeyPath } = config.githubApp;
  if (appId === undefined) {
    const token = config.githubToken;
    if (token === undefined || token === '') {
      throw new Error('the github provider needs githubToken or githubApp.appId');
    }
    return async () => Promise.resolve(token);
  }
  if (installationId === undefined || privateKeyPath === undefined) {
    throw new Error('a GitHub App needs githubApp.installationId and githubApp.privateKeyPath');
  }

  let auth: ReturnType<typeof createAppAuth> | undefined;
  return async () => {
    try {
      // The App's auth caches the installation token and renews it before it expires.
      auth ??= createAppAuth({
        appId,
        installationId,
        privateKey: await readFile(privateKeyPath, 'utf8'),
        request: request.defaults({ request: { fetch: fetchImpl } }),
      });
      const { token } = await auth({ type: 'installation' });
      return token;
    } catch (error) {
      throw toAuthError(error);
    }
  };
}
