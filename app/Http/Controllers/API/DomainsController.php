<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\API\BaseController as BaseController;
use Illuminate\Http\Request;
use App\Http\Resources\Domains as DomainsResource;
use App\Models\Domains;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator as Validator;

class DomainsController extends BaseController {
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    protected $logFile = 'domains.log';

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
            $this->sendCommandToService(
              $this->logFile,
              json_encode([
                "command" => "create",
                ...$domains->toArray()
              ])
            );
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

        $domains = Domains::find($id);
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
     * 
     */

    public function update(int $domainId, Request $request, Domains $domains) {
        $input = $request->all();
        if(count($input) !== 0):
          foreach($input as $key => $value):
            $update[$key] = $value;
          endforeach;
        endif;

        if(isset($input['host'])) {
          $domainHost = $domains->select('host')->find($domainId)->toArray()['host'];
          $update['host'] = array_merge(json_decode($domainHost, true), json_decode($input['host'], true));
        }


        if($domains::where('id', $domainId)->update($update)) {
          $this->sendCommandToService(
            $this->logFile,
            json_encode([
              "command" => "update",
              ...$domains::find($domainId)->toArray(),
            ])
          );
        }

        return $this->sendResponse($domainId, 'Domain updated successfully.');

    }

   

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function destroy($id, Domains $domains) {

        $domain = $domains::find($id);

        if($domains->where('id', $id)->delete()) {
            $this->sendCommandToService(
              $this->logFile,
              json_encode([
                "command" => "delete",
                ...$domain->toArray()
              ])
            );
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
