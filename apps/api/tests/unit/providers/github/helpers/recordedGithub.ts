import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NODES_FIXTURE_PREFIXES, RECORDING_DIR, searchFixtureName } from '@tests/fixtures/github/recording';
import { FakeGithub } from './fakeGithub';

type Recorded = { data: { nodes?: { id: string }[] } } & Record<string, unknown>;

function load(name: string): Recorded {
  return JSON.parse(readFileSync(path.join(RECORDING_DIR, `${name}.json`), 'utf8')) as Recorded;
}

/** Serves the sweep recorded by tests/fixtures/github/record.ts, answering each nodes query by the ids it asks for. */
export function aRecordedGithub(): FakeGithub {
  const files = readdirSync(RECORDING_DIR).map((file) => path.basename(file, '.json'));
  const github = new FakeGithub()
    .on('Roster', () => load('roster'))
    .on('SearchPullRequests', ({ variables }) => load(searchFixtureName(String(variables.query))));

  for (const [operation, prefix] of Object.entries(NODES_FIXTURE_PREFIXES)) {
    const recordings = files.filter((name) => name.startsWith(`${prefix}-`)).map(load);
    github.on(operation, ({ variables }) => {
      const ids = (variables.ids as string[]).join();
      const recording = recordings.find((candidate) => (candidate.data.nodes ?? []).map((node) => node.id).join() === ids);
      if (recording === undefined) {
        throw new Error(`nothing recorded for ${operation} of ${ids}`);
      }
      return recording;
    });
  }
  return github;
}
