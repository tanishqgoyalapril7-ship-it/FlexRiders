import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production: served at flexriders.in/admin (the landing site forwards /admin here), built with
// `npm run build:admin`. Dev keeps the root path.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    // Fixed port: the landing page's "Admin Login" button links here. strictPort stops Vite from silently
    // moving to another port when 5180 is taken (another app on 5173 made the button open the wrong site).
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
