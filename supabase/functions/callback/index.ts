import { createClient } from 'npm:@supabase/supabase-js@2';

interface CallbackData {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    const callbackData: CallbackData = await req.json();
    console.log('Received M-Pesa callback:', JSON.stringify(callbackData, null, 2));

    const { stkCallback } = callbackData.Body;
    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata
    } = stkCallback;

    let transactionDetails = {};
    
    // Extract transaction details if payment was successful
    if (ResultCode === 0 && CallbackMetadata) {
      const items = CallbackMetadata.Item;
      transactionDetails = {
        amount: items.find(item => item.Name === 'Amount')?.Value,
        mpesa_receipt_number: items.find(item => item.Name === 'MpesaReceiptNumber')?.Value,
        transaction_date: items.find(item => item.Name === 'TransactionDate')?.Value,
        phone_number: items.find(item => item.Name === 'PhoneNumber')?.Value,
      };
    }

    // Update transaction in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('transactions')
        .update({
          status: ResultCode === 0 ? 'completed' : 'failed',
          result_code: ResultCode.toString(),
          result_desc: ResultDesc,
          transaction_details: transactionDetails,
          callback_received_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('checkout_request_id', CheckoutRequestID);

      console.log(`Transaction ${CheckoutRequestID} updated with status: ${ResultCode === 0 ? 'completed' : 'failed'}`);
    }

    // Return success response to M-Pesa
    return new Response(
      JSON.stringify({
        ResultCode: 0,
        ResultDesc: 'Callback processed successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Callback processing error:', error);
    
    // Still return success to M-Pesa to avoid retries
    return new Response(
      JSON.stringify({
        ResultCode: 0,
        ResultDesc: 'Callback processed'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});