<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\API\BaseController as BaseController;
use Illuminate\Http\Request;
use App\Http\Resources\Zone as ZoneResource;
use App\Models\Zones;
use App\Models\Domains;
use Illuminate\Support\Facades\Log;
use Validator;

class ZoneController extends BaseController
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function index() {
        $domains = Zones::all();
        return $this->sendResponse(ZoneResource::collection($domains), 'Domain retrieved successfully.');
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
            'domains_id' => 'integer|required',
            'sub' => 'required',
            'type' => 'required',
            'ip_or_fqdn' => 'required'
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());       
        }

        if(Zones::create($input)) {
            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/domains.log'),
                ])->info('update domains from:'.Domains::find($input['domains_id'])['fqdn'].' to:'.Domains::find($input['domains_id'])['fqdn']);
        }
        return $this->sendResponse(new ZoneResource($input), 'Domain created successfully.');

    } 

   

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function show($id) {

        $domains = Zones::find($id);
        if (is_null($domains)) {
            return $this->sendError('Zones not found.');
        }

        return $this->sendResponse(new ZoneResource($domains), 'Zones retrieved successfully.');
    }

    

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function update($requestDomain, Request $request, Zones $domains) {
        $input = $request->all();

        $validator = Validator::make($input, [
            'fqdn' => 'required',
            'ns1' => 'required',
            'ns2' => 'required'
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

    public function destroy($id) {

        $domain = Domains::find(Zones::find($id)['domains_id']);

        if(Zones::where('id', $id)->delete()) {
            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/domains.log'),
                ])->info('update domains from:'.$domain['fqdn'].' to:'.$domain['fqdn']);
            return $this->sendResponse([], 'Domain deleted successfully.');
        } else {
            return $this->sendError('An error Occured');
        }
        
    }
}
