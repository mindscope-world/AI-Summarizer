import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Override with CLIENT_PORT when 3000 is taken. strictPort makes a clash fail loudly
      // instead of silently moving to another port (which could collide with the API).
      port: Number(process.env.CLIENT_PORT) || 3000,
      strictPort: true,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // In dev the browser talks to Vite (:3000); /api is forwarded to the Express server.
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
