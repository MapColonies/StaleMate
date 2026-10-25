import { describe, expect, it } from 'vitest';
import {
  AGE_PRESETS,
  DEFAULT_FILTERS,
  type Filters,
  IDLE_PRESETS,
  activeFilterCount,
  applyFilters,
  clearedBesidesSearch,
  facetCounts,
  parseFilters,
  partyKey,
  serializeFilters,
} from '@/filters/filter-model';
import type { TrackedPr } from '@/snapshot/types';
import { aPr, bot, clock, member, outsider, waitingOnAuthor, waitingOnReviewer, waitingOnTeam, waitingOnTheTeam } from './fixtures/snapshot';

const everyFilterSet: Filters = {
  q: 'fix the #12 thing',
  repo: ['MapColonies/opa-la', 'MapColonies/raster-catalog'],
  author: ['bob', 'carol'],
  reviewer: ['alice'],
  waitingOn: ['alice', '@infra'],
  review: ['awaitingReview', 'changesRequested'],
  check: ['failing'],
  reason: ['teamRepo', 'teamReviewRequested'],
  ageMin: 5,
  ageMax: 20,
  idleOver: 3,
  hideBots: false,
  hideOutsiders: true,
  hideViaTeam: true,
};

describe('the filter model in the URL', () => {
  it('is the defaults when the URL has no filters', () => {
    expect(parseFilters('')).toEqual(DEFAULT_FILTERS);
  });

  it('hides Bots by default', () => {
    expect(DEFAULT_FILTERS.hideBots).toBe(true);
  });

  it('writes nothing for the defaults', () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('');
  });

  it('round-trips every filter', () => {
    expect(parseFilters(serializeFilters(everyFilterSet))).toEqual(everyFilterSet);
  });

  it('round-trips each filter on its own', () => {
    for (const key of Object.keys(everyFilterSet) as (keyof Filters)[]) {
      const filters = { ...DEFAULT_FILTERS, [key]: everyFilterSet[key] };

      expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    }
  });

  it('reads a leading question mark', () => {
    expect(parseFilters(`?${serializeFilters(everyFilterSet)}`)).toEqual(everyFilterSet);
  });

  it('keeps the parameters it does not own, such as a view sort', () => {
    const search = serializeFilters({ ...DEFAULT_FILTERS, author: ['bob'] }, '?sort=age.desc&tab=mine');
    const params = new URLSearchParams(search);

    expect(params.get('sort')).toBe('age.desc');
    expect(params.get('tab')).toBe('mine');
    expect(parseFilters(search).author).toEqual(['bob']);
  });

  it('removes a filter set back to its default', () => {
    const search = serializeFilters(everyFilterSet, '?sort=age.desc');

    expect(serializeFilters(DEFAULT_FILTERS, search)).toBe('sort=age.desc');
  });

  it('ignores values it does not know', () => {
    const filters = parseFilters('review=approved,merged&check=green&reason=whim&ageMin=old&ageMax=-3&idle=&hideBots=maybe');

    expect(filters).toEqual({ ...DEFAULT_FILTERS, review: ['approved'] });
  });

  it('ignores empty list items', () => {
    expect(parseFilters('author=,bob,,').author).toEqual(['bob']);
  });
});

describe('the presets', () => {
  it('round-trip through the URL, so the matching preset shows as picked', () => {
    for (const { ageMin, ageMax } of AGE_PRESETS) {
      const filters = { ...DEFAULT_FILTERS, ageMin, ageMax };

      expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    }
    for (const { idleOver } of IDLE_PRESETS) {
      const filters = { ...DEFAULT_FILTERS, idleOver };

      expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    }
  });

  it('count in Working Days', () => {
    expect(AGE_PRESETS.map((preset) => preset.ageMax ?? preset.ageMin)).toEqual([null, 5, 20, 60, 60]);
    expect(IDLE_PRESETS.map((preset) => preset.idleOver)).toEqual([null, 1, 3, 5]);
  });

  it('start with the one that filters nothing', () => {
    expect(AGE_PRESETS[0]).toMatchObject({ ageMin: DEFAULT_FILTERS.ageMin, ageMax: DEFAULT_FILTERS.ageMax });
    expect(IDLE_PRESETS[0]).toMatchObject({ idleOver: DEFAULT_FILTERS.idleOver });
  });
});

describe('partyKey', () => {
  it('is the login for a person and @slug for a team', () => {
    expect(partyKey(waitingOnReviewer(member('alice')))).toBe('alice');
    expect(partyKey(waitingOnTheTeam)).toBe('@infra');
    expect(partyKey(waitingOnTeam('raster'))).toBe('@raster');
  });
});

describe('activeFilterCount', () => {
  it('is zero for the defaults', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts each filter that differs from its default once', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, author: ['bob', 'carol'], hideBots: false, q: 'x' })).toBe(3);
  });

  it('can leave out the search', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, author: ['bob'], q: 'x' }, { besidesSearch: true })).toBe(1);
  });
});

describe('clearedBesidesSearch', () => {
  it('puts every filter back to its default but the search', () => {
    expect(clearedBesidesSearch({ ...DEFAULT_FILTERS, author: ['bob'], idleOver: 3, hideBots: false, q: 'tiles' })).toEqual({
      ...DEFAULT_FILTERS,
      q: 'tiles',
    });
  });
});

describe('applyFilters', () => {
  const show = (overrides: Partial<Filters>) => ({ ...DEFAULT_FILTERS, hideBots: false, ...overrides });

  it('hides Bot-authored PRs by default', () => {
    const human = aPr({ author: member('bob') });
    const renovate = aPr({ author: bot('renovate') });

    expect(applyFilters([human, renovate], DEFAULT_FILTERS)).toEqual([human]);
    expect(applyFilters([human, renovate], show({}))).toEqual([human, renovate]);
  });

  it('hides PRs by authors outside the Team on request', () => {
    const human = aPr({ author: member('bob') });
    const external = aPr({ author: outsider('stranger') });

    expect(applyFilters([human, external], show({ hideOutsiders: true }))).toEqual([human]);
  });

  it('searches the title, repo, number and author, ignoring case', () => {
    const pr = aPr({ title: 'Bump Helm chart', repo: 'MapColonies/raster-catalog', number: 412, author: member('Dana') });

    for (const q of ['helm', 'RASTER-cat', '#412', 'dana', '  bump  ']) {
      expect(applyFilters([pr], show({ q }))).toEqual([pr]);
    }
    expect(applyFilters([pr], show({ q: 'vector' }))).toEqual([]);
  });

  it('searches by Jira Ticket, which the title names', () => {
    const ticketed = aPr({ title: 'Bump Helm chart MAPCO-10930', jiraTickets: ['MAPCO-10930'] });
    const other = aPr({ title: 'Bump Helm chart MAPCO-1', jiraTickets: ['MAPCO-1'] });

    expect(applyFilters([ticketed, other], show({ q: 'mapco-10930' }))).toEqual([ticketed]);
  });

  it('keeps a PR matching any value of a filter, and only PRs matching every filter', () => {
    const a = aPr({ repo: 'MapColonies/a', author: member('bob') });
    const b = aPr({ repo: 'MapColonies/b', author: member('carol') });
    const c = aPr({ repo: 'MapColonies/c', author: member('bob') });

    expect(applyFilters([a, b, c], show({ repo: ['MapColonies/a', 'MapColonies/b'] }))).toEqual([a, b]);
    expect(applyFilters([a, b, c], show({ repo: ['MapColonies/a', 'MapColonies/b'], author: ['bob'] }))).toEqual([a]);
  });

  it('filters by Review Status, Check Status and Inclusion Reason', () => {
    const approved = aPr({ reviewStatus: 'approved', checkStatus: 'failing', inclusionReasons: ['authoredByMember'] });
    const draft = aPr({ reviewStatus: 'draft', checkStatus: 'passing', inclusionReasons: ['teamRepo', 'assignedToMember'] });

    expect(applyFilters([approved, draft], show({ review: ['approved'] }))).toEqual([approved]);
    expect(applyFilters([approved, draft], show({ check: ['passing'] }))).toEqual([draft]);
    expect(applyFilters([approved, draft], show({ reason: ['assignedToMember'] }))).toEqual([draft]);
  });

  it('matches a reviewer who is requested or has reviewed', () => {
    const requested = aPr({ requestedReviewers: [member('alice')], reviewers: [] });
    const reviewed = aPr({ requestedReviewers: [], reviewers: [member('alice')] });
    const other = aPr({ requestedReviewers: [member('carol')], reviewers: [] });

    expect(applyFilters([requested, reviewed, other], show({ reviewer: ['alice'] }))).toEqual([requested, reviewed]);
  });

  it('matches Waiting On by login, and teams by @slug', () => {
    const onAlice = aPr({ waitingOn: [waitingOnReviewer(member('alice'))] });
    const onTheTeam = aPr({ waitingOn: [waitingOnTheTeam] });
    const onAnotherTeam = aPr({ waitingOn: [waitingOnTeam('raster')] });
    const onAuthor = aPr({ author: member('bob'), waitingOn: [waitingOnAuthor(member('bob'))] });
    const all = [onAlice, onTheTeam, onAnotherTeam, onAuthor];

    expect(applyFilters(all, show({ waitingOn: ['alice'] }))).toEqual([onAlice]);
    expect(applyFilters(all, show({ waitingOn: ['@infra', '@raster'] }))).toEqual([onTheTeam, onAnotherTeam]);
    expect(applyFilters(all, show({ waitingOn: ['bob'] }))).toEqual([onAuthor]);
  });

  it('keeps Ages within the range, in Working Days, from the minimum up to but not including the maximum', () => {
    const young = aPr({ age: clock(4.9) });
    const five = aPr({ age: clock(5) });
    const old = aPr({ age: clock(20) });

    expect(applyFilters([young, five, old], show({ ageMin: 5 }))).toEqual([five, old]);
    expect(applyFilters([young, five, old], show({ ageMax: 20 }))).toEqual([young, five]);
    expect(applyFilters([young, five, old], show({ ageMin: 5, ageMax: 20 }))).toEqual([five]);
  });

  it('keeps PRs idle for more than N Working Days', () => {
    const three = aPr({ idleTime: clock(3) });
    const more = aPr({ idleTime: clock(3.1) });

    expect(applyFilters([three, more], show({ idleOver: 3 }))).toEqual([more]);
  });
});

describe('facetCounts', () => {
  const alice = member('alice');
  const bob = member('bob');
  const carol = member('carol');
  const counts = (prs: TrackedPr[], filters: Partial<Filters>, facet: Parameters<typeof facetCounts>[2]) =>
    Object.fromEntries(facetCounts(prs, { ...DEFAULT_FILTERS, ...filters }, facet));

  const prs = [
    aPr({ repo: 'MapColonies/a', author: bob, reviewStatus: 'awaitingReview', waitingOn: [waitingOnReviewer(alice)] }),
    aPr({ repo: 'MapColonies/a', author: carol, reviewStatus: 'approved', waitingOn: [waitingOnAuthor(carol)] }),
    aPr({ repo: 'MapColonies/b', author: bob, reviewStatus: 'approved', waitingOn: [waitingOnAuthor(bob), waitingOnTheTeam] }),
    aPr({ repo: 'MapColonies/b', author: bot('renovate'), reviewStatus: 'approved', waitingOn: [waitingOnAuthor(bot('renovate'))] }),
  ];

  it('counts the PRs that pass the filters for each value of a facet', () => {
    expect(counts(prs, {}, 'repo')).toEqual({ 'MapColonies/a': 2, 'MapColonies/b': 1 });
    expect(counts(prs, {}, 'waitingOn')).toEqual({ alice: 1, carol: 1, bob: 1, '@infra': 1 });
  });

  it('reflects the other active filters', () => {
    expect(counts(prs, { review: ['approved'] }, 'repo')).toEqual({ 'MapColonies/a': 1, 'MapColonies/b': 1 });
    expect(counts(prs, { hideBots: false, review: ['approved'] }, 'repo')).toEqual({ 'MapColonies/a': 1, 'MapColonies/b': 2 });
  });

  it('ignores the facet’s own selection, so its other values keep their counts', () => {
    expect(counts(prs, { repo: ['MapColonies/a'] }, 'repo')).toEqual({ 'MapColonies/a': 2, 'MapColonies/b': 1 });
    expect(counts(prs, { repo: ['MapColonies/a'] }, 'author')).toEqual({ bob: 1, carol: 1 });
  });

  it('counts a PR once per value, even when a reviewer is both requested and has reviewed', () => {
    const pr = aPr({ requestedReviewers: [alice], reviewers: [alice, bob] });

    expect(counts([pr], {}, 'reviewer')).toEqual({ alice: 1, bob: 1 });
  });

  it('counts each Inclusion Reason of a PR', () => {
    const pr = aPr({ inclusionReasons: ['teamRepo', 'teamReviewRequested'] });

    expect(counts([pr], {}, 'reason')).toEqual({ teamRepo: 1, teamReviewRequested: 1 });
  });
});
