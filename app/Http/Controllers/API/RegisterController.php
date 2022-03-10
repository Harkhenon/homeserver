<?php

namespace App\Http\Controllers\API;

use Illuminate\Http\Request;
use App\Http\Controllers\API\BaseController as BaseController;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Validator;

class RegisterController extends BaseController {

    /**
     * Register api
     *
     * @return \Illuminate\Http\Response
     */

    public function register(Request $request) {
        $validator = Validator::make($request->all(), [
            'name' => 'required',
            'email' => 'required|email',
            'password' => 'required',
            'c_password' => 'required|same:password',
        ]);

        if($validator->fails()) {
            return $this->sendError('Validation Error.', $validator->errors(), 417);       
        }

        $input = $request->all();
        $input['password'] = bcrypt($input['password']);
        $user = User::create($input);
        $success['token'] =  $user->createToken('MyApp')->accessToken;
        $success['name'] =  $user->name;
        return $this->sendResponse($success, 'User register successfully.');
    }

    /**
     * Login api
     *
     * @return \Illuminate\Http\Response
     */

    public function login(Request $request) {
        if(Auth::guard('web')->attempt(['email' => $request->email, 'password' => $request->password])){ 
            $user = Auth::guard('web')->user(); 
            $success['token'] =  $user->createToken('MyApp')-> accessToken; 
            $success['id'] =  $user->id;
            return $this->sendResponse($success, 'User login successfully.');
        } 
        else { 
            return $this->sendError('Unauthorised.', [], 401);
        } 
    }

    public function check(Request $request) {
        return $this->sendResponse("success", 'Check', 200);
    }
}