import { defineConfig } from 'vitest/config';
import path from 'node:path';

// E2E: exercita a aplicação rodando (npm run dev/start) via HTTP.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['tests/e2e/**/*.test.ts'], environment: 'node', testTimeout: 60000, fileParallelism: false },
});
