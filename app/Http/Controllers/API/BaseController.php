<?php


namespace App\Http\Controllers\API;

use Illuminate\Http\Request;
use App\Http\Controllers\Controller as Controller;

class BaseController extends Controller

{

    /**
     * success response method.
     *
     * @return \Illuminate\Http\Response
     */

    public function sendResponse($result, $message, $code = 200) {
    	$response = [
            'success' => true,
            'data'    => $result,
            'message' => $message,
        ];

        return response()->json($response, $code, [], JSON_PRETTY_PRINT);
    }


    /**
     * return error response.
     *
     * @return \Illuminate\Http\Response
     */

    public function sendError($error, $errorMessages = [], $code = 404) {

    	$response = [
            'success' => false,
            'message' => $error,
        ];

        if(!empty($errorMessages)){
            $response['data'] = $errorMessages;
        }

        return response()->json($response, $code, [], JSON_PRETTY_PRINT);
    }
    
    /**
     * sendCommandToService
     * 
     * Send JSON command to a logfile to be get by the daemon
     *
     * @param  mixed $file
     * @param  mixed $command
     * @param  mixed $append
     * @return void
     */
    public function sendCommandToService(string $file, string $command, bool $append = false) {
      file_put_contents(
        storage_path('logs/'.$file),
        $command,
        $append ? FILE_APPEND : null
      );
    }
}