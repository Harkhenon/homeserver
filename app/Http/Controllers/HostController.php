<?php

namespace App\Http\Controllers;

use App\Http\Controllers\API\BaseController;
use Illuminate\Http\Request;
use App\Models\Host;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Validator;

class HostController extends Controller {
/**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function index() {
      return Inertia::render('Hosting/Hosting', [
        'hosts' => Host::all()->toArray()
      ]);
    }

    /**
     * Store a newly created resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\Response
     */

    public function store(Request $request, Host $host) {
    } 

   

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function show(Host $host) {
    }

    public function edit(Host $host) {
      return Inertia::render('Hosting/EditHost', [
        'host' => $host->toArray()
      ]);
    }

    

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function update(Request $request, Host $host) {


    }

   

    /**
     * Remove the specified resource from storage.
     *
     * @param  string  $fqdn
     * @return \Illuminate\Http\Response
     */

    public function destroy(Host $host, Request $request) {
    }

    public function fileExists(Request $request) {
      return file_exists($request->input('file'));
    }
}