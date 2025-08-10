import { createClient } from 'npm:@supabase/supabase-js@2';

interface DarajaTokenResponse {
  access_token: string;
  expires_in: string;
}

interface STKQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function getDarajaToken(): Promise<string> {
  const consumerKey = Deno.env.get('DARAJA_CONSUMER_KEY') || 'sYs9Ig9SvbwVOqqiJ6psYKJWBu1wi3kzG7YXN2ApwL2BYdxO';
  const consumerSecret = Deno.env.get('DARAJA_CONSUMER_SECRET') || 'xailp5i99ryshgC3L7BnP17dPTNAvvxAXlKlOOyHQmWqbcUkDQowxMkIsc4o7EYr';
  
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  
  const response = await fetch('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get Daraja token');
  }

  const data: DarajaTokenResponse = await response.json();
  return data.access_token;
}

async function querySTKStatus(accessToken: string, checkoutRequestId: string): Promise<STKQueryResponse> {
  const businessShortCode = Deno.env.get('DARAJA_BUSINESS_SHORT_CODE') || '174379'; // You'll need to get your production shortcode
  const passkey = Deno.env.get('DARAJA_PASSKEY') || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'; // You'll need your production passkey
  
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = btoa(`${businessShortCode}${passkey}${timestamp}`);

  const requestBody = {
    BusinessShortCode: businessShortCode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const response = await fetch('https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('STK Query error:', errorText);
    throw new Error(`STK Query failed: ${response.status}`);
  }

  return await response.json();
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'GET') {
      throw new Error('Method not allowed');
    }

    const url = new URL(req.url);
    const checkoutRequestId = url.searchParams.get('checkoutRequestId');

    if (!checkoutRequestId) {
      throw new Error('checkoutRequestId parameter is required');
    }

    console.log(`Checking payment status for: ${checkoutRequestId}`);

    // Get Daraja access token
    const accessToken = await getDarajaToken();

    // Query STK status
    const statusResponse = await querySTKStatus(accessToken, checkoutRequestId);
    console.log('STK status response:', statusResponse);

    let status = 'pending';
    let message = 'Payment is being processed';

    // Result codes: 0 = Success, Others = Failed
    if (statusResponse.ResultCode === '0') {
      status = 'completed';
      message = 'Payment completed successfully';
      
      // Update transaction status in Supabase
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('transactions')
          .update({
            status: 'completed',
            result_code: statusResponse.ResultCode,
            result_desc: statusResponse.ResultDesc,
            updated_at: new Date().toISOString()
          })
          .eq('checkout_request_id', checkoutRequestId);
      }
    } else if (statusResponse.ResultCode && statusResponse.ResultCode !== '1032') {
      // 1032 means the request is still being processed
      status = 'failed';
      message = statusResponse.ResultDesc || 'Payment failed';
      
      // Update transaction status in Supabase
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('transactions')
          .update({
            status: 'failed',
            result_code: statusResponse.ResultCode,
            result_desc: statusResponse.ResultDesc,
            updated_at: new Date().toISOString()
          })
          .eq('checkout_request_id', checkoutRequestId);
      }
    }

    return new Response(
      JSON.stringify({
        status,
        message,
        resultCode: statusResponse.ResultCode,
        resultDesc: statusResponse.ResultDesc,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Payment status error:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});