import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // HS_API_TARGET permet de viser un panel distant (ex. la VM de test).
      '/api': { target: process.env.HS_API_TARGET ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
});
