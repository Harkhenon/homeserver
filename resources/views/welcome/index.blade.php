<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Homeserver</title>
  <!-- Import Google Icon Font -->
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
  <!-- Import materialize.css -->
  <link href="{{ asset('css/materialize.min.css') }}" rel="stylesheet">
  <link href="{{ asset('css/app.css') }}" rel="stylesheet">
</head>

<body>

    <!-- React root DOM -->
    <div id="root">
    </div>
    <script src="{{ asset('js/materialize.min.js') }}"></script>
    <!-- React JS -->
    <script src="{{ asset('js/app.js') }}" defer></script>

</body>
</html>