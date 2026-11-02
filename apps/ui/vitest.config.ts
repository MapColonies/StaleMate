import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // A fixed running version, so tests can tell it from a deployed one.
  define: { __APP_VERSION__: JSON.stringify('1.2.3') },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    // Node 25+ has its own localStorage global, which hides jsdom's; turn it off in the test workers.
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
});
