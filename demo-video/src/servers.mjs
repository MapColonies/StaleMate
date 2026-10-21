// Starts the StaleMate API on its fixture data and the UI's dev server, on ports of their own so a running dev setup
// doesn't get in the way. The API must be built first (pnpm --filter stalemate-api build).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const API_PORT = 8090;
const UI_PORT = 5190;

async function waitFor(url, what) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${what} didn't come up at ${url}`);
}

/** Starts both servers and answers the UI's URL, and a function that stops them. */
export async function startServers() {
  const api = spawn('node', ['--import', './instrumentation.mjs', './index.js'], {
    cwd: `${REPO}/apps/api/dist`,
    env: { ...process.env, CONFIG_OFFLINE_MODE: 'true', PROVIDER: 'fixture', SERVER_PORT: String(API_PORT) },
    stdio: 'ignore',
  });
  const ui = spawn('pnpm', ['exec', 'vite', '--port', String(UI_PORT), '--strictPort'], {
    cwd: `${REPO}/apps/ui`,
    env: { ...process.env, API_URL: `http://localhost:${API_PORT}` },
    stdio: 'ignore',
    detached: true,
  });
  const stop = () => {
    api.kill();
    // pnpm runs vite as a child, so stop the whole group.
    process.kill(-ui.pid);
  };
  try {
    await waitFor(`http://localhost:${API_PORT}/snapshot`, 'The API');
    await waitFor(`http://localhost:${UI_PORT}/`, 'The UI');
  } catch (error) {
    stop();
    throw error;
  }
  return { url: `http://localhost:${UI_PORT}/`, stop };
}
