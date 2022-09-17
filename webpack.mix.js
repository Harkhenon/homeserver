const mix = require('laravel-mix');
const path = require('path');
/*
 |--------------------------------------------------------------------------
 | Mix Asset Management
 |--------------------------------------------------------------------------
 |
 | Mix provides a clean, fluent API for defining some Webpack build steps
 | for your Laravel application. By default, we are compiling the Sass
 | file for the application as well as bundling up all the JS files.
 |
 */

mix.js('resources/js/app.js', 'public/js')
    .alias({
        '@js': path.join(__dirname, 'resources/js'),
        '@src': path.join(__dirname, 'resources/js/components'),
        '@components': path.join(__dirname, 'resources/js/components/Components'),
        '@containers': path.join(__dirname, 'resources/js/containers')
    })
    .sourceMaps()
    .sass('resources/sass/app.scss', 'public/css')
    .react()