import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NODES_FIXTURE_PREFIXES, RECORDING_DIR, SearchFixtureNames } from '@tests/fixtures/github/recording';
import { FakeGithub, requestedIds } from './fakeGithub';

type Recorded = { data: Record<string, unknown> } & Record<string, unknown>;

/** The ids of the PRs a recorded response holds, whether as one list or each under its own alias. */
function recordedIds({ data }: Recorded): string[] {
  const nodes = Array.isArray(data.nodes) ? data.nodes : Object.entries(data).flatMap(([key, node]) => (/^pr\d+$/.test(key) ? [node] : []));
  return (nodes as ({ id: string } | null)[]).flatMap((node) => (node === null ? [] : [node.id]));
}

function load(name: string): Recorded {
  return JSON.parse(readFileSync(path.join(RECORDING_DIR, `${name}.json`), 'utf8')) as Recorded;
}

/** Serves the sweep recorded by tests/fixtures/github/record.ts, answering each nodes query by the ids it asks for. */
export function aRecordedGithub(): FakeGithub {
  const files = readdirSync(RECORDING_DIR).map((file) => path.basename(file, '.json'));
  const searchNames = new SearchFixtureNames();
  const github = new FakeGithub()
    .on('Roster', () => load('roster'))
    .on('SearchPullRequests', ({ variables }) => load(searchNames.next(String(variables.query))));

  for (const [operation, prefix] of Object.entries(NODES_FIXTURE_PREFIXES)) {
    const recordings = files.filter((name) => name.startsWith(`${prefix}-`)).map(load);
    github.on(operation, ({ variables }) => {
      const ids = requestedIds(variables).join();
      const recording = recordings.find((candidate) => recordedIds(candidate).join() === ids);
      if (recording === undefined) {
        throw new Error(`nothing recorded for ${operation} of ${ids}`);
      }
      return recording;
    });
  }
  return github;
}
