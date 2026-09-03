import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `base` is set from an env var so the same build works whether it is served from the root of
 * a domain (Cloudflare Pages, Netlify) or from a subfolder (GitHub Pages, which serves at
 * /<repo-name>/). Set GR_BASE=/girls-room/ when building for Pages.
 */
export default defineConfig({
  base: process.env['GR_BASE'] ?? '/',
  build: { outDir: 'dist', emptyOutDir: true },
});
