import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Shown in Settings so anyone can tell which version their phone has. Netlify sets COMMIT_REF.
const commit = (() => {
  try {
    return (process.env.COMMIT_REF || execSync('git rev-parse HEAD').toString()).trim().slice(0, 7);
  } catch {
    return 'dev';
  }
})();
const built = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${commit} · ${built}`),
  },
  build: {
    rollupOptions: {
      input: {
        login: resolve(import.meta.dirname, 'index.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
        forgot: resolve(import.meta.dirname, 'forgot-password.html'),
        reset: resolve(import.meta.dirname, 'reset-password.html'),
        signup: resolve(import.meta.dirname, 'signup.html'),
      },
    },
  },
});
