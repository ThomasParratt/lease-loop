import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// docs/features/test-isolation.md (D37).
const domainTests = ['src/domain/**/*.test.ts'];

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    // Files run in parallel: each DB test file copies its own SQLite file (tests/helpers/test-db.ts)
    // and `isolate` gives each file its own module graph, so its own event-handler registry.
    fileParallelism: true,
    isolate: true,
    coverage: {
      provider: 'v8',
      // Business logic and server code must stay tested; UI pages are not measured.
      include: ['src/domain/**', 'src/server/**', 'src/data/**', 'src/i18n/**'],
      exclude: ['**/*.test.ts', '**/*.json', '**/*.md'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 60, functions: 60, branches: 60, statements: 60 },
    },
    projects: [
      {
        // Pure functions: shuffled, files and tests, to prove no test leans on another's order.
        // A failure prints its seed; rerun with `--sequence.seed=<seed>` and fix the test.
        extends: true,
        test: { name: 'domain', include: domainTests, sequence: { shuffle: true } },
      },
      {
        // Database and file tests: tests inside a file run in the order written.
        extends: true,
        test: {
          name: 'server',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...domainTests],
        },
      },
    ],
  },
});
