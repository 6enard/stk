const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for transactions (replace with database in production)
const transactions = new Map();

// Helper function to get Daraja token
async function getDarajaToken() {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  
  if (!consumerKey || !consumerSecret) {
    throw new Error('Daraja credentials not configured');
  }
  
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  try {
    const response = await axios.get(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
        },
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get Daraja token:', error.response?.data || error.message);
    throw new Error('Failed to get Daraja token');
  }
}

// Helper function to initiate STK push
async function initiateSTKPush(accessToken, phone, amount) {
  const businessShortCode = process.env.DARAJA_BUSINESS_SHORT_CODE || '174379';
  const passkey = process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const callbackUrl = process.env.DARAJA_CALLBACK_URL || `http://localhost:${PORT}/api/callback`;
  
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');

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

  try {
    const response = await axios.post(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('STK Push error:', error.response?.data || error.message);
    throw new Error(`STK Push failed: ${error.response?.status || 'Unknown error'}`);
  }
}

// Helper function to query STK status
async function querySTKStatus(accessToken, checkoutRequestId) {
  const businessShortCode = process.env.DARAJA_BUSINESS_SHORT_CODE || '174379';
  const passkey = process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');

  const requestBody = {
    BusinessShortCode: businessShortCode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  try {
    const response = await axios.post(
      'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('STK Query error:', error.response?.data || error.message);
    throw new Error(`STK Query failed: ${error.response?.status || 'Unknown error'}`);
  }
}

// Routes
app.post('/api/stk-push', async (req, res) => {
  try {
    const { phone, amount, items } = req.body;

    // Validate request
    if (!phone || !amount || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data'
      });
    }

    // Validate phone number format (should be 254xxxxxxxxx)
    const phoneRegex = /^254[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use 254XXXXXXXXX'
      });
    }

    // Validate amount
    if (amount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least KSh 1'
      });
    }

    console.log(`Initiating STK push for ${phone}, amount: ${amount}`);

    // Get Daraja access token
    const accessToken = await getDarajaToken();
    console.log('Got Daraja access token');

    // Initiate STK push
    const stkResponse = await initiateSTKPush(accessToken, phone, amount);
    console.log('STK push response:', stkResponse);

    // Store transaction in memory
    transactions.set(stkResponse.CheckoutRequestID, {
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      phoneNumber: phone,
      amount: amount,
      items: items,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'STK push sent successfully',
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
    });

  } catch (error) {
    console.error('STK Push error:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/payment-status', async (req, res) => {
  try {
    const { checkoutRequestId } = req.query;

    if (!checkoutRequestId) {
      return res.status(400).json({
        status: 'error',
        message: 'checkoutRequestId parameter is required'
      });
    }

    console.log(`Checking payment status for: ${checkoutRequestId}`);

    // Check local transaction first
    const transaction = transactions.get(checkoutRequestId);
    if (transaction && transaction.status !== 'pending') {
      return res.json({
        status: transaction.status,
        message: transaction.status === 'completed' ? 'Payment completed successfully' : 'Payment failed',
        resultCode: transaction.resultCode,
        resultDesc: transaction.resultDesc,
      });
    }

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
      
      // Update transaction status
      if (transaction) {
        transaction.status = 'completed';
        transaction.resultCode = statusResponse.ResultCode;
        transaction.resultDesc = statusResponse.ResultDesc;
        transaction.updatedAt = new Date().toISOString();
      }
    } else if (statusResponse.ResultCode && statusResponse.ResultCode !== '1032') {
      // 1032 means the request is still being processed
      status = 'failed';
      message = statusResponse.ResultDesc || 'Payment failed';
      
      // Update transaction status
      if (transaction) {
        transaction.status = 'failed';
        transaction.resultCode = statusResponse.ResultCode;
        transaction.resultDesc = statusResponse.ResultDesc;
        transaction.updatedAt = new Date().toISOString();
      }
    }

    res.json({
      status,
      message,
      resultCode: statusResponse.ResultCode,
      resultDesc: statusResponse.ResultDesc,
    });

  } catch (error) {
    console.error('Payment status error:', error);
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
});

app.post('/api/callback', (req, res) => {
  try {
    console.log('Received M-Pesa callback:', JSON.stringify(req.body, null, 2));

    const { Body } = req.body;
    if (!Body || !Body.stkCallback) {
      return res.json({
        ResultCode: 0,
        ResultDesc: 'Callback processed'
      });
    }

    const { stkCallback } = Body;
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
        mpesaReceiptNumber: items.find(item => item.Name === 'MpesaReceiptNumber')?.Value,
        transactionDate: items.find(item => item.Name === 'TransactionDate')?.Value,
        phoneNumber: items.find(item => item.Name === 'PhoneNumber')?.Value,
      };
    }

    // Update transaction in memory
    const transaction = transactions.get(CheckoutRequestID);
    if (transaction) {
      transaction.status = ResultCode === 0 ? 'completed' : 'failed';
      transaction.resultCode = ResultCode.toString();
      transaction.resultDesc = ResultDesc;
      transaction.transactionDetails = transactionDetails;
      transaction.callbackReceivedAt = new Date().toISOString();
      transaction.updatedAt = new Date().toISOString();
    }

    console.log(`Transaction ${CheckoutRequestID} updated with status: ${ResultCode === 0 ? 'completed' : 'failed'}`);

    // Return success response to M-Pesa
    res.json({
      ResultCode: 0,
      ResultDesc: 'Callback processed successfully'
    });

  } catch (error) {
    console.error('Callback processing error:', error);
    
    // Still return success to M-Pesa to avoid retries
    res.json({
      ResultCode: 0,
      ResultDesc: 'Callback processed'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});