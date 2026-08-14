import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project site under /<repo>/, so the built asset URLs
// need that prefix. CI sets PUBLIC_BASE; local dev and local builds stay at /.
export default defineConfig({
  base: process.env.PUBLIC_BASE || '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
