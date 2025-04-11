<?php

namespace App\Http\Controllers;

use Exception;
use Illuminate\Http\Request;
use App\Http\Resources\Domains as DomainsResource;
use App\Models\Domains;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator as Validator;
use Inertia\Inertia;
use App\Models\Host;
use App\Models\Zones;
use App\Server\PythonWebsocket;
use InternalIterator;

class DomainsController extends Controller {
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    protected $logFile = 'domains.log';

    public function index() {
        $domains = Domains::all();
        return $domains->toArray();
    }

    public function status(): void {
      $socket = new PythonWebsocket('', 6256, '');
      dd($socket->command());
    }

    /**
     * Store a newly created resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\Response
     */

    public function store(Request $request) {
        $input = $request->all();

        $validator = Validator::make($input, [
            'fqdn' => 'required',
            'ns1' => 'required',
            'ns2' => 'required',
            'zones' => 'required'
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());
        }

        try {
          $domain = Domains::create($input);
        } catch(Exception $e) {
          return $this->sendError('Error while storing domain', 500);
        }

    }

    public function edit(Host $host) {
      return Inertia::render('Hosting/EditHost', [
        'host' => $host
      ]);
    }



    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function show($id) {

        $domains = Domains::find($id);
        if (is_null($domains)) {
            return $this->sendError('Domain not found.');
        }

        return $domains;
    }



    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     *
     */

    public function update(string $fqdn, Request $request, Domains $domains) {
      $input = $request->all();

      if(count($input) !== 0):
        foreach($input as $key => $value):
          $update[$key] = $value;
        endforeach;
      endif;

      try {
        Domains::where('fqdn', $fqdn)->update($input);
        return Inertia::render('Domains/Domains', [
          'domains' => Domains::all()->toArray(),
          'item' => Domains::where('fqdn', $fqdn)->first(),
        ]);
      } catch(Exception $e) {
        dd($e);
      }

    }



    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function destroy(int $id, Domains $domains) {
      if(Domains::where('id', $id)->delete())
        return to_route('domains');
      else
        return $this->sendError('Error', [], 500);
    }

    public function getDefaultDomain() {
        return Domains::where('default', 1);
    }
}
