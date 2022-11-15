<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="description" content="Homeserver is your web home companion! Create fastly web hosts in your Raspberry PI with PHP, MySQL, NodeJS and so more!" />
      <meta name="keywords" content="homeserver,linux,raspberry,webhosting,nodejs,php,mysql" />
      <meta name="theme-color" content="#202124"/>
      <link rel="stylesheet" href="{{ Vite::asset('resources/js/app.css') }}" />
      <link rel="stylesheet" href="{{ Vite::asset('resources/sass/app.scss') }}" />
      <title>Homeserver</title>
  </head>
    <body>
        <div id="root">
        </div>
      <script type="module" src="{{ Vite::asset('resources/js/app.jsx') }}" defer></script>
    </body>
</html>