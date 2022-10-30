<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\API\BaseController;
use Illuminate\Http\Request;
use App\Models\Host;
use App\Http\Resources\HostResource;
use Illuminate\Support\Facades\Log;
use Validator;

class HostController extends BaseController {
/**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function index() {
        $domains = Host::all();
        return $this->sendResponse(
            HostResource::collection($domains), 
            'Host retrieved successfully.'
        );
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
            'node_port' => 'required',
            'php_user' => 'required',
            "ftp_enabled" => 'required',
            'ssh_enabled' => 'required',
            'disk_space' => 'required',
            'plans_id' => 'required',
            'root_dir' => 'required'
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());       
        }

        if($host = Host::create($input)) {
            $build = "insert hosts fqdn:{$input['fqdn']}";

            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/hosts.log'),
              ])->info($build);
        }
        return $this->sendResponse(new HostResource($host), 'Host created successfully.');

    } 

   

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function show($domain) {

        $host = Host::where('fqdn', $domain)->get();
        if (is_null($host)) {
            return $this->sendError('Host not found.');
        }

        return $this->sendResponse(new HostResource($host), 'Host retrieved successfully.');
    }

    

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function update($requestHost, Request $request) {
        $input = $request->all();

        $validator = Validator::make($input, [
            'fqdn' => 'required',
            'node_port' => 'required',
            'php_user' => 'required',
            "ftp_enabled" => 'required',
            'ssh_enabled' => 'required',
            'disk_space' => 'required',
            'plans_id' => 'required',
            'root_dir' => 'required'
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());       
        }

        if(Host::where('fqdn', $requestHost)
                ->update([
                    'node_port' => $input['node_port'],
                    'php_user' => $input['php_user'],
                    "ftp_enabled" => $input['ftp_enabled'],
                    'ssh_enabled' => $input['ssh_enabled'],
                    'disk_space' => $input['disk_space'],
                    'plans_id' => $input['plans_id'],
                    'root_dir' => $input['root_dir']
                ])) {

            $build = "update hosts fqdn:{$input["fqdn"]}";

            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/hosts.log'),
                ])->info($build);
        }

        return $this->sendResponse($requestHost, 'Host updated successfully.');

    }

   

    /**
     * Remove the specified resource from storage.
     *
     * @param  string  $fqdn
     * @return \Illuminate\Http\Response
     */

    public function destroy($hostname, Request $request) {

        if(Host::where('fqdn', $hostname)->delete()) {
        Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/hosts.log'),
                ])->info('delete hosts fqdn:'.$hostname);
        }
        return $this->sendResponse([], 'Host deleted successfully.');
    }
}