import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed under /<repo>/ops/ on GitHub Pages; CI sets PUBLIC_BASE. Local dev
// and local builds stay at /.
export default defineConfig({
  base: process.env.PUBLIC_BASE || '/',
  plugins: [react()],
  root: '.',
  server: {
    host: '0.0.0.0',
    port: 4000,
  },
});
