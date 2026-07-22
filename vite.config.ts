import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR can be disabled via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Backend writes here; do not trigger frontend full reload.
      watch: {
        ignored: ['**/uploads/**', '**/data.json', '**/visitor_stats.json', '**/vibecoding-projects.json'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true,
          // Large PDF uploads (multipart) can take minutes; avoid premature proxy timeouts.
          timeout: 600_000,
          proxyTimeout: 600_000,
        },
      },
    },
  };
});
