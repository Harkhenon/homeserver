<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use JWTAuth;
use Tymon\JWTAuth\Exceptions\JWTException;

class UserController extends Controller
{
    public function __construct() {
        $this->middleware('auth:api', ['except' => ['login']]);
    }

    public function login(Request $request) {

        if(Auth::guard()->user()) {
            return response()->json([
                "message" => "Already logged in"
            ], 200);
        }

        $credentials = $request->only('email', 'password');

        $validator = Validator::make($credentials, [
            'email' => 'required|email',
            'password' => 'required'
        ]);

        if($validator->fails()) {
            return response()->json([
                "message" => "Email or Password is misformed"
            ], 401)->withCallback($request->input('callback'));
        }

        try {
            if (!$token = JWTAuth::attempt($credentials)) {
                return response()->json([
                    "message" => "Bad credentials"
                ], 401)->withCallback($request->input('callback'));
            }
        } catch(JWTException $e) {
                return response()->json([
                    "message" => "An error occured",
                    "details" => $e
                ], 400)->withCallback($request->input('callback'));
        }

        return response()->json([
            "message" => "Successfully Logged In",
            "api_token" => $token
        ], 200)->withCallback($request->input('callback'));
    }
}