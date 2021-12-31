@extends('layout')
@section('title', 'Home')

@section('content')

    @unless (Auth::check())
        <div id="main-table" class="dimmed pusher">
            <div class="machine-container os">
                <span class="system"></span>
            </div>
            <div class="machine-container cpu">
                <div class="machine-cpu circle">
                    CPU CHARGE
                </div>
                <div class="load"></div>
            </div>
            <div class="machine-container ram">
                <div class="machine-ram circle">
                    RAM CHARGE
                </div>
                <div class="load"></div>
            </div>
            <div class="machine-container disk">
                <div class="machine-disk circle">
                    DISK CHARGE
                </div>
                <div class="load"></div>
            </div>
        </div>
    @endunless
@endsection
