import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    allowedHosts: true,
    // Allow GHL iframe to load this page
    headers: {
      'X-Frame-Options': 'ALLOWALL',
    },
  },
  // Environment variables prefixed with VITE_ are exposed to the client
  envPrefix: 'VITE_',
});
