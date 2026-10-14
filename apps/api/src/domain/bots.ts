import type { Actor } from './facts';

/** An account is a Bot when the code host types it as one, or when its login is configured as one (e.g. a service account). */
export function isBot(actor: Actor, botLogins: readonly string[]): boolean {
  return actor.isBot || botLogins.includes(actor.login);
}
