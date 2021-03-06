<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

use
    App\Models\BankAccount,
    App\Models\BankExpense,
    App\Models\BankIncoming,
    App\Models\BankRegularFee,
    App\Models\BankAccountType
;

class BankController extends Controller
{
    public function __construct() {

    }

    /**
     * Get all accounts with their types and their mooves
     * 
     * @param Request $request Request object
     * 
     * @return response()->json
     */
    public function index(Request $request) {
        return response()->json(BankAccount::with([
                'type',
                'expenses' => function($query) {
                    $query->orderBy("created_at", "DESC");
                },
                'incomings' => function($query) {
                    $query->orderBy("created_at", "DESC");
                },
                'regularFees' => function($query) {
                    $query->orderBy("created_at", "DESC");
                },
            ])->get()
            , 200, [], JSON_PRETTY_PRINT
        );
        
    }
    /**
     * Get One account by id
     * 
     * @param int $id Account ID
     * @param Request $request Request object
     * 
     * @return response()->json
     */
    public function getCurrentAccount($id, Request $request) {
        return response()->json(
            BankAccount::with([
                'type',
                'expenses' => function($query) {
                    $query->orderBy("created_at", "DESC");
                },
                'incomings' => function($query) {
                    $query->orderBy("created_at", "ASC");
                },
                'regularFees' => function($query) {
                    $query->orderBy("created_at", "DESC");
                },
            ])
            ->where('id', '=', $id)
            ->orderBy('created_at', "DESC")
            ->get()
            , 200, [], JSON_PRETTY_PRINT
        );
    }
    /**
     * Updates account informations
     * 
     * @param int $id Account ID
     * @param Request $request Request object
     * @return response()->json
     * 
     */ 
    public function updateAccount($id, Request $request) {
        $validatedData = $request->validate([
            "name" => ["required"],
            "bank_account_type_id" => ["nullable"]
        ]);

        extract($validatedData);

        $account = new BankAccount();
        $updated = $account->find($id);
        $updated->name = $name;
        if($bank_account_type_id) {
            $updated->bank_account_type_id = $bank_account_type_id;
        }

        $updated->save();

        return response()->json([
            "message" => "Updated"
        ], 200, [], JSON_PRETTY_PRINT);
    }

    /**
     * Deletes account by its ID
     * 
     * @param int $id Account ID
     * @param Request $request Request object
     * @return response()->json
     * 
     */
    public function deleteAccount($id, Request $resquest) {
        $account = new BankAccount();
        $deleted = $account->find($id);
        $deleted->delete();

        return response()->json([
            "message" => "Deleted"
        ], 200, [], JSON_PRETTY_PRINT);
    }

    /**
     * Create an account
     * 
     * @param Request $request
     * 
     * @return response()->json
     */
    public function createAccount(Request $request) {

    }

    /**
     * Create an operation
     * 
     * @param Request $request Request object
     * 
     * @return respone()->json
     */
    public function createOperation(Request $request) {

        $validatedData = $request->validate([
            'moove_account_id' => ['required', 'numeric'],
            'moove_type' => ['required'],
            'moove_name' => ['required'],
            'moove_amount' => ['required', 'numeric'],
            'moove_description' => ['required']
        ]);

        extract($validatedData);

        $moove = $this->_chooseType($moove_type);

        $moove->amount = $moove_amount;
        $moove->name = $moove_name;
        $moove->comment = $moove_description;
        $moove->bank_account_id = $moove_account_id;

        $moove->save();

        return response()->json([
            "message" => "Created",
            "operation" => $moove->id,
        ], 201, [], JSON_PRETTY_PRINT);
    }

    public function readOperation($id, Request $request) {

    }

    public function updateOperation($id, Request $request) {

        $validatedData = $request->validate([
            "type" => ["required"],
            "name" => ["required"],
            "amount" => ["required", "numeric"],
            "comment" => ["required"],
        ]);

        extract($validatedData);

        $moove = $this->_chooseType($type);
        $updated = $moove->find($id);
        $updated->name = $name;
        $updated->amount = $amount;
        $updated->comment = $comment;

        $updated->save();

        return response()->json([
            "message" => "Updated",
            "id" => $updated->id
        ], 200, [], JSON_PRETTY_PRINT);
    }

    public function deleteOperation($id, Request $request) {
        $validatedData = $request->validate([
            'type' => ['required'],
        ]);

        extract($validatedData);

        $moove = $this->_chooseType($type);
        $deleted = $moove->where('id', $id)->delete();

        return response()->json([
            "message" => "Deleted",
            "data" => $deleted
        ], 200, [], JSON_PRETTY_PRINT);
    }

    public function getAccountTypes(Request $request) {
        return response()->json(BankAccountType::all(), 200, [], JSON_PRETTY_PRINT);
    }

    protected function _chooseType($type) {
  
        switch($type) {
            case "expenses":
                $moove = new BankExpense;
                break;
            case "incomings":
                $moove = new BankIncoming;
                break;
            case "regular_fees":
                $moove = new BankRegularFee;
                break;
            default:
                $moove = null;
        }

        return $moove;
    }
}
