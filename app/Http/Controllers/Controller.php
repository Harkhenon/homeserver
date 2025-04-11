<?php

namespace App\Http\Controllers;

abstract class Controller
{
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
}
