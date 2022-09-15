<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\API\BaseController as BaseController;
use Illuminate\Http\Request;
use App\Http\Resources\Domains as DomainsResource;
use App\Models\Domains;
use Illuminate\Support\Facades\Log;
use Validator;

class DomainsController extends BaseController {
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function index() {
        $domains = Domains::all();
        return $this->sendResponse(DomainsResource::collection($domains), 'Domain retrieved successfully.');
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
            'ns2' => 'required'
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());       
        }

        if($domains = Domains::create($input)) {
            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/domains.log'),
              ])->info('insert domains new:'.$input["fqdn"].' ns1:'.$input["ns1"].' ns2:'.$input["ns2"]);
        }
        return $this->sendResponse(new DomainsResource($domains), 'Domain created successfully.');

    } 

   

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function show($id) {

        $domains = Domains::find($id)->with('zone');
        if (is_null($domains)) {
            return $this->sendError('Domain not found.');
        }

        return $this->sendResponse(new DomainsResource($domains), 'Domain retrieved successfully.');
    }

    

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function update($requestDomain, Request $request, Domains $domains) {
        $input = $request->all();

        $validator = Validator::make($input, [
            'fqdn' => 'required',
            'ns1' => 'required',
            'ns2' => 'required',
            'zone' => ''
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());       
        }

        if($domains::where('fqdn', $requestDomain)
                ->update([
                    'fqdn' => $input['fqdn'],
                    'ns1' => $input['ns1'],
                    'ns2' => $input['ns2']
                ])) {
            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/domains.log'),
                ])->info('update domains from:'.$requestDomain.' to:'.$input["fqdn"].' ns1:'.$input["ns1"].' ns2:'.$input["ns2"]);
        }

        return $this->sendResponse($requestDomain, 'Domain updated successfully.');

    }

   

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function destroy($domain, Domains $domains) {

        if($domains->where('fqdn', $domain)->delete()) {
            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/domains.log'),
                ])->info('delete domains deleted:'.$domain);
        }
        return $this->sendResponse([], 'Domain deleted successfully.');
    }

    public function getDefaultDomain() {
        return $this->sendResponse(
            Domains::where('default', 1)->get(),
            'Got it!'
        );
    }
}
