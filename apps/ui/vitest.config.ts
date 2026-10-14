import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
});
