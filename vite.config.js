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
        }
    },
    resolve: {
        alias: {
            '@': path.join(__dirname, 'resources/'),
            '@js': path.join(__dirname, 'resources/js'),
            '@sass': path.join(__dirname, 'resources/sass'),
            '@src': path.join(__dirname, 'resources/js/components'),
            '@containers': path.join(__dirname, 'resources/js/containers'),
        }
    }
});