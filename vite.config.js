import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        login: resolve(import.meta.dirname, 'index.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
        forgot: resolve(import.meta.dirname, 'forgot-password.html'),
        reset: resolve(import.meta.dirname, 'reset-password.html'),
      },
    },
  },
});
