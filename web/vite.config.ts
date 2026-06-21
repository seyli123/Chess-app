import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the shared package straight from source (no build step in dev).
      '@chess/shared': resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
  server: { port: 5173 },
});
