<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Websocket address
    |--------------------------------------------------------------------------
    |
    | Wezbsocket server address
    |
    */

    'websocket_ip' => env('WEBSOCKET_IP', 'localhost'),

    /*
    |--------------------------------------------------------------------------
    | Websocket port
    |--------------------------------------------------------------------------
    |
    | Websocket server port
    |
    */

    'websocket_port' => env('WEBSOCKET_PORT', 6256),

    /*
    |--------------------------------------------------------------------------
    | Websocket path
    |--------------------------------------------------------------------------
    |
    | Websocket server path
    |
    */

    'websocket_path' => env('WEBSOCKET_PATH', '/'),

    /*
    |--------------------------------------------------------------------------
    | Websocket status path
    |--------------------------------------------------------------------------
    |
    | Websocket server status path
    |
    */

    'websocket_status_path' => env('WEBSOCKET_STATUS_PATH', '/status'),
];
