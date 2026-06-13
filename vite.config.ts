import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error plain-JS server module, not covered by tsconfig
import { createVaultApi } from './server/vault-api.mjs';

const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'vault-data');

// Mounts the local file-storage API into both `vite dev` and `vite preview`,
// so one command runs the whole app — UI + Mac-file backend.
function vaultFiles(): Plugin {
  return {
    name: 'vault-files',
    configureServer(server) {
      server.middlewares.use(createVaultApi(dataRoot));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createVaultApi(dataRoot));
    },
  };
}

export default defineConfig({
  // GitHub Pages serves from /<repo>/ — set by the deploy workflow only;
  // local dev/build stays at the root
  base: process.env.PAGES_BASE || '/',
  plugins: [react(), vaultFiles()],
});
