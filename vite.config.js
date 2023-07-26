import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'path';
 
export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/sass/app.scss',
                'resources/js/app.jsx',
            ],
            refresh: true,
        }),
        react(),
    ],
    server: {
        hmr: {
            host: '127.0.0.1',
            protocol: 'ws'
        },
        proxy: {
          '/api': {
            target: 'https://isodev.ovh/api',
            changeOrigin: true,
            secure: false,
            ws: true
          }
        }
    },
    resolve: {
        alias: {
            '@': path.join(__dirname, 'resources/'),
            '@js': path.join(__dirname, 'resources/js'),
            '@sass': path.join(__dirname, 'resources/sass'),
            '@src': path.join(__dirname, 'resources/js/components'),
            '@components': path.join(__dirname, 'resources/js/components'),
        }
    }
});