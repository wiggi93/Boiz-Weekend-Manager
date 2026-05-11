import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// For GitHub Pages deployment, the base path should match the repo name.
// If you deploy as a user/org site (`<user>.github.io`), set base to '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/Boiz-Weekend-Manager/',
});
