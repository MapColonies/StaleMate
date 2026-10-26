import { describe, expect, it } from 'vitest';
import type { Actor, PrFacts, ReviewRequestFact } from '@domain/facts';
import type { InclusionReason } from '@domain/trackedPr';
import { deriveTrackedPr, deriveMembers } from '@domain/deriveTrackedPr';
import { aDerivationConfig, anActor, aPrFacts, aReview, aRoster, aTeam } from '@tests/utils/facts';

const now = new Date('2026-10-14T12:00:00Z');

const alice = anActor({ id: 'U_alice', login: 'alice' });
const bob = anActor({ id: 'U_bob', login: 'bob' });
// Not a Team Member.
const dave = anActor({ id: 'U_dave', login: 'dave' });
const erin = anActor({ id: 'U_erin', login: 'erin' });
const renovate = anActor({ id: 'BOT_renovate', login: 'renovate', isBot: true });
// Configured as a Bot in bots.logins rather than typed as one by the code host, and a Team Member.
const serviceAccount = anActor({ id: 'U_devops', login: 'mapcolonies-devops' });

const roster = aRoster({ members: [alice, bob, serviceAccount], repos: ['MapColonies/opa-la'] });
const team = aTeam({ roster });
const outsideRepo = 'MapColonies/raster-catalog-manager';

const requested = (reviewer: Actor): ReviewRequestFact => ({ type: 'person', reviewer, asCodeOwner: false });
const teamRequested = (slug: string): ReviewRequestFact => ({ type: 'team', slug, asCodeOwner: false });

function derive(overrides: Partial<PrFacts>): ReturnType<typeof deriveTrackedPr> {
  return deriveTrackedPr(aPrFacts({ author: dave, ...overrides }), team, aDerivationConfig(), now);
}

describe('Inclusion Reasons', function () {
  it.each<[string, Partial<PrFacts>, InclusionReason[]]>([
    ['a PR in a Team Repo', { repo: 'MapColonies/opa-la' }, ['teamRepo']],
    ['a PR a Team Member authored', { repo: outsideRepo, author: alice }, ['authoredByMember']],
    ['a PR a service account in the Team authored', { repo: outsideRepo, author: serviceAccount }, ['authoredByMember']],
    ['a PR a Team Member is requested to review', { repo: outsideRepo, reviewRequests: [requested(bob)] }, ['memberReviewRequested']],
    ['a PR a Team Member reviewed', { repo: outsideRepo, reviews: [aReview({ author: bob, state: 'commented' })] }, ['reviewedByMember']],
    ['a PR a Team Member is assigned to', { repo: outsideRepo, assignees: [alice] }, ['assignedToMember']],
    ['a PR that asks the Team for review', { repo: outsideRepo, reviewRequests: [teamRequested('infra')] }, ['teamReviewRequested']],
  ])('should include %s', function (_, overrides, reasons) {
    expect(derive(overrides).inclusionReasons).toEqual(reasons);
  });

  it('should give every reason that holds, once each, strongest first', function () {
    const trackedPr = derive({
      repo: 'MapColonies/opa-la',
      author: alice,
      assignees: [alice, bob],
      reviewRequests: [teamRequested('infra'), requested(bob), requested(serviceAccount)],
      reviews: [aReview({ id: 'PRR_1', author: bob }), aReview({ id: 'PRR_2', author: bob })],
    });

    expect(trackedPr.inclusionReasons).toEqual([
      'authoredByMember',
      'memberReviewRequested',
      'teamReviewRequested',
      'assignedToMember',
      'reviewedByMember',
      'teamRepo',
    ]);
  });

  it.each<[string, Partial<PrFacts>]>([
    ['a request to review from an outsider', { reviewRequests: [requested(erin)] }],
    ['a request to another team', { reviewRequests: [teamRequested('raster')] }],
    ['a review by an outsider', { reviews: [aReview({ author: erin })] }],
    ['an outsider assigned', { assignees: [erin] }],
  ])('should not count %s', function (_, overrides) {
    expect(derive({ repo: 'MapColonies/opa-la', ...overrides }).inclusionReasons).toEqual(['teamRepo']);
  });

  it("should not count a Team Member's review of their own PR as reviewed by a Team Member", function () {
    const trackedPr = derive({ repo: outsideRepo, author: alice, reviews: [aReview({ author: alice, state: 'commented' })] });

    expect(trackedPr.inclusionReasons).toEqual(['authoredByMember']);
  });

  it('should recognise a Team Member by id, not by login', function () {
    const renamedAlice = anActor({ id: 'U_alice', login: 'alice-renamed' });
    const impostor = anActor({ id: 'U_impostor', login: 'alice' });

    expect(derive({ repo: outsideRepo, author: renamedAlice }).inclusionReasons).toEqual(['authoredByMember']);
    expect(derive({ repo: outsideRepo, author: impostor, assignees: [alice] }).inclusionReasons).toEqual(['assignedToMember']);
  });
});

describe('author kind', function () {
  it.each<[string, Actor, string]>([
    ['a Team Member', alice, 'member'],
    ['an account the code host types as a Bot', renovate, 'bot'],
    ['a Team Member whose login is configured as a Bot', serviceAccount, 'bot'],
    ['a configured Bot login outside the Team', anActor({ id: 'U_org', login: 'mapcolonies-org' }), 'bot'],
    ['anyone else', dave, 'outsider'],
  ])('should classify %s', function (_, author, kind) {
    expect(derive({ author }).author).toEqual({ login: author.login, kind });
  });

  it('should classify every Team Member', function () {
    const team = deriveMembers(roster, aDerivationConfig());

    expect(team).toEqual([
      { login: 'alice', kind: 'member' },
      { login: 'bob', kind: 'member' },
      { login: 'mapcolonies-devops', kind: 'bot' },
    ]);
  });
});

describe('participants', function () {
  it('should list the assignees and requested reviewers with their kinds', function () {
    const trackedPr = derive({ assignees: [alice, dave], reviewRequests: [requested(bob), teamRequested('infra'), requested(renovate)] });

    expect(trackedPr.assignees).toEqual([
      { login: 'alice', kind: 'member' },
      { login: 'dave', kind: 'outsider' },
    ]);
    expect(trackedPr.requestedReviewers).toEqual([
      { login: 'bob', kind: 'member' },
      { login: 'renovate', kind: 'bot' },
    ]);
  });

  it('should list each person other than the author who reviewed, once, leaving Bots out', function () {
    const trackedPr = derive({
      reviews: [
        aReview({ id: 'PRR_1', author: bob, state: 'commented' }),
        aReview({ id: 'PRR_2', author: dave, state: 'commented' }),
        aReview({ id: 'PRR_3', author: renovate, state: 'commented' }),
        aReview({ id: 'PRR_4', author: serviceAccount, state: 'approved' }),
        aReview({ id: 'PRR_5', author: erin, state: 'changesRequested' }),
        aReview({ id: 'PRR_6', author: bob, state: 'approved' }),
      ],
    });

    expect(trackedPr.reviewers).toEqual([
      { login: 'bob', kind: 'member' },
      { login: 'erin', kind: 'outsider' },
    ]);
  });
});
