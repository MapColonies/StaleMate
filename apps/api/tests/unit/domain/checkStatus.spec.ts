import { describe, expect, it } from 'vitest';
import type { CheckFact } from '@domain/facts';
import type { CheckStatus } from '@domain/trackedPr';
import { deriveCheckStatus } from '@domain/checkStatus';
import { aPrFacts } from '@tests/utils/facts';

const JIRA_CHECKS = ['jira/issue-validation', 'jira-validation'];

const check = (name: string, state: CheckFact['state']): CheckFact => ({ name, state });

describe('deriveCheckStatus', function () {
  it.each<[string, CheckFact[], CheckStatus]>([
    ['every check passed', [check('build', 'passed'), check('test', 'passed')], 'passing'],
    ['any check failed', [check('build', 'passed'), check('test', 'failed'), check('lint', 'pending')], 'failing'],
    ['a check is still pending and none failed', [check('build', 'passed'), check('test', 'pending')], 'pending'],
    ['there are no checks', [], 'none'],
    ['only the Jira check failed', [check('build', 'passed'), check('jira/issue-validation', 'failed')], 'passing'],
    ['only the Jira check is pending', [check('build', 'passed'), check('jira-validation', 'pending')], 'passing'],
    ['the Jira checks are the only checks', [check('jira/issue-validation', 'failed'), check('jira-validation', 'passed')], 'none'],
    ['a check besides the Jira check failed', [check('build', 'failed'), check('jira/issue-validation', 'passed')], 'failing'],
  ])('should derive Check Status when %s', function (_, checks, expected) {
    const facts = aPrFacts();
    facts.headCommit.checks = checks;

    expect(deriveCheckStatus(facts, JIRA_CHECKS)).toBe(expected);
  });
});
