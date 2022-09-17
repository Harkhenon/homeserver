<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/semantic-ui/2.4.1/semantic.min.css">
    <link rel="stylesheet" type="text/css" href="{{ asset('assets/css/app.css') }}" />
    <title>Homeserver - @yield('title')</title>
</head>
<body>
    @include('Parts.header')
    <main>
        <div class="ui sidebar vertical blur menu">
            <nav>
                <a href="#" class="sidebar-toggle item">Accueil</a>
                <a href="#" class="sidebar-toggle item">Packages</a>
                <a href="#" class="sidebar-toggle item">Console</a>
                <a href="#" class="sidebar-toggle item">Configuration</a>
            </nav>
        </div>
        @yield('content')
    </main>
    <script defer src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <script defer src="https://cdnjs.cloudflare.com/ajax/libs/semantic-ui/2.4.1/semantic.min.js"></script>
    <script defer src="{{ asset('assets/js/main.js') }}"></script>
</body>
</html>
