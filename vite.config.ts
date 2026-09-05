import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { localAPI } from './server/dev.ts';
import { pwaAssets } from './server/pwa-assets.ts';

export default defineConfig({
  plugins: [react(), localAPI(), pwaAssets()],
  server: { port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'], environment: 'node' },
});