import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type ProxyOptions} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Libraries change rarely, the app's own code often: separate files keep the libraries cached across deploys.
          manualChunks(id: string) {
            if (id.includes('node_modules/@supabase')) return 'supabase';
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            return undefined;
          },
        },
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
        '/api': <ProxyOptions>{
          target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
          changeOrigin: true,
          // When the API isn't running, Vite's default is an empty 500. Answer in the API's own
          // error shape instead so the UI can tell the developer what to do.
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if (!('writeHead' in res) || res.headersSent) return;
              res.writeHead(503, {'Content-Type': 'application/json'});
              res.end(
                JSON.stringify({
                  error: {
                    code: 'upstream_error',
                    message:
                      'The API server is not running. Check the terminal running `npm run dev` for a startup error (for example a missing GROQ_API_KEY in .env), then restart it.',
                    requestId: 'dev-proxy',
                  },
                }),
              );
            });
          },
        },
      },
    },
  };
});
