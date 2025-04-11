import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    laravel({
      input: 'resources/js/app.jsx',
      refresh: true,
    }),
    react(),
  ],
  server: {
    host: true,
    hmr: {
      protocol: 'wss',
      host: 'localhost',
    },
  },
  resolve: {
    alias: {
      '@resources': path.join(__dirname, 'resources/'),
      '@js': path.join(__dirname, 'resources/js'),
      '@sass': path.join(__dirname, 'resources/sass'),
      '@img': path.join(__dirname, 'resources/img'),
      '@pages': path.join(__dirname, 'resources/js/Pages'),
    },
  },
});
