import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/film-analyzer-pro/',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            const parts = id.split('node_modules/')[1];
            if (!parts) return;

            const name = parts.startsWith('@')
              ? parts.split('/').slice(0, 2).join('/')
              : parts.split('/')[0];

            if (name === 'react' || name === 'react-dom') return 'react';
            if (name === 'firebase') return 'firebase';
            if (name === '@google/genai') return 'ai';
            if (name === 'lucide-react' || name === 'motion') return 'ui';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
