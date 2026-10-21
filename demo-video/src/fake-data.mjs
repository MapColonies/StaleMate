// Turns the API's fixture Snapshot into the video's: real logins swapped for invented ones, and the PRs that become the
// Viewer's turn on camera, which is what makes the bell's Notifications arrive live.

export const VIEWER = 'mergey-mcmergeface';

const NAMES = {
  CptSchnitz: VIEWER,
  AnguIar: 'ada-lovelint',
  alex131290: 'bobby-tables',
  netanelC: 'geo-jason',
  michalby24: 'polly-gon',
  ronenkapelian: 'sudo-nym',
  'elad-hartog': 'ctrl-alt-elite',
  'dana-raster': 'null-island',
  'yoav-3d': 'longi-dude',
  'shira-vector': 'raster-farian',
  'eyal-gis': 'geo-cache',
  'noam-catalog': 'tiler-swift',
  'tal-export': 'rubber-duck',
};

/** Teammates' PRs with no reviewer, which ask the Viewer for a review once the news lands. */
const NEWS_PR_IDS = ['PR_fixture_31', 'PR_fixture_63'];

function rename(value) {
  if (Array.isArray(value)) {
    return value.map(rename);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, rename(inner)]));
  }
  return typeof value === 'string' && value in NAMES ? NAMES[value] : value;
}

function askViewerToReview(pr) {
  const viewer = { login: VIEWER, kind: 'member' };
  return {
    ...pr,
    requestedReviewers: [...pr.requestedReviewers, viewer],
    waitingOn: [{ type: 'person', ...viewer, role: 'reviewer', moves: ['review'] }],
    noReviewer: false,
  };
}

/** The Snapshot as the video shows it, with or without the news for the Viewer. */
export function fakeSnapshot(snapshot, { withNews }) {
  const renamed = rename(snapshot);
  if (!withNews) {
    return renamed;
  }
  return { ...renamed, prs: renamed.prs.map((pr) => (NEWS_PR_IDS.includes(pr.id) ? askViewerToReview(pr) : pr)) };
}
