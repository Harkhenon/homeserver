<?php

namespace App\Http\Controllers\API;

use Illuminate\Http\Request;
use App\Http\Controllers\API\BaseController as BaseController;
use App\Models\User;
use Validator;
use App\Http\Resources\User as UserResource;

class UserController extends BaseController
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function index() {
        $bankaccounts = User::all();
        return $this->sendResponse(UserResource::collection($bankaccounts), 'Bank accounts retrieved successfully.');
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
            'name' => 'required',
            'bank_account_type_id' => 'required',
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());       
        }

        $bankaccount = User::create($input);
        return $this->sendResponse(new UserResource($bankaccount), 'Bank account created successfully.');

    } 

   

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function show($id) {

        $bankaccount = User::find($id);
        if (is_null($bankaccount)) {
            return $this->sendError('Bank account not found.');
        }

        return $this->sendResponse(new UserResource($bankaccount), 'Bank account retrieved successfully.');
    }

    

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function update(Request $request, User $bankaccount) {
        $input = $request->all();

        $validator = Validator::make($input, [
            'name' => 'required',
            'bank_account_type_id' => 'required'
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors());       
        }

        $bankaccount->name = $input['name'];
        $bankaccount->bank_account_type_id = $input['bank_account_type_id'];
        $bankaccount->save();

        return $this->sendResponse(new UserResource($bankaccount), 'Bank account updated successfully.');

    }

   

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */

    public function destroy(User $bankaccount) {

        $bankaccount->delete();
        return $this->sendResponse([], 'Bank account deleted successfully.');
    }
}
