<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="description" content="Homeserver is your web home companion!" />
      <meta name="theme-color" content="#202124"/>
      <title>Homeserver</title>
  </head>
    <body>
        <!-- React root DOM -->
        <div id="root">
        </div>
        @viteReactRefresh
    @vite
    </body>
</html>