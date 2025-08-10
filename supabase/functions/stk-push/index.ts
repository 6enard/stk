import { createClient } from 'npm:@supabase/supabase-js@2';

interface PaymentRequest {
  phone: string;
  amount: number;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}

interface DarajaTokenResponse {
  access_token: string;
  expires_in: string;
}

interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function initiateSTKPush(accessToken: string, phone: string, amount: number): Promise<STKPushResponse> {
  const businessShortCode = Deno.env.get('DARAJA_BUSINESS_SHORT_CODE') || '174379'; // You'll need to get your production shortcode
  const passkey = Deno.env.get('DARAJA_PASSKEY') || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'; // You'll need your production passkey
  const callbackUrl = Deno.env.get('DARAJA_CALLBACK_URL') || 'https://stk-sigma.vercel.app/api/callback';
  
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = btoa(`${businessShortCode}${passkey}${timestamp}`);

  const requestBody = {
    BusinessShortCode: businessShortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: businessShortCode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: `TechStore-${Date.now()}`,
    TransactionDesc: 'Payment for TechStore items'
  };

  const response = await fetch('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('STK Push error:', errorText);
    throw new Error(`STK Push failed: ${response.status}`);
  }

  return await response.json();
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    const { phone, amount, items }: PaymentRequest = await req.json();

    // Validate request
    if (!phone || !amount || !items || items.length === 0) {
      throw new Error('Invalid request data');
    }

    // Validate phone number format (should be 254xxxxxxxxx)
    const phoneRegex = /^254[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
      throw new Error('Invalid phone number format. Use 254XXXXXXXXX');
    }

    // Validate amount
    if (amount < 1) {
      throw new Error('Amount must be at least KSh 1');
    }

    console.log(`Initiating STK push for ${phone}, amount: ${amount}`);

    // Get Daraja access token
    const accessToken = await getDarajaToken();
    console.log('Got Daraja access token');

    // Initiate STK push
    const stkResponse = await initiateSTKPush(accessToken, phone, amount);
    console.log('STK push response:', stkResponse);

    // Store transaction in Supabase (optional)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.from('transactions').insert({
        checkout_request_id: stkResponse.CheckoutRequestID,
        merchant_request_id: stkResponse.MerchantRequestID,
        phone_number: phone,
        amount: amount,
        items: items,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'STK push sent successfully',
        checkoutRequestId: stkResponse.CheckoutRequestID,
        merchantRequestId: stkResponse.MerchantRequestID,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('STK Push error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});