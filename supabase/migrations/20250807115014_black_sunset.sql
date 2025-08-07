/*
  # Create transactions table for M-Pesa payments

  1. New Tables
    - `transactions`
      - `id` (uuid, primary key)
      - `checkout_request_id` (text, unique) - M-Pesa checkout request ID
      - `merchant_request_id` (text) - M-Pesa merchant request ID
      - `phone_number` (text) - Customer phone number
      - `amount` (integer) - Payment amount in KSh
      - `items` (jsonb) - Array of purchased items
      - `status` (text) - Transaction status (pending, completed, failed)
      - `result_code` (text) - M-Pesa result code
      - `result_desc` (text) - M-Pesa result description
      - `transaction_details` (jsonb) - Additional transaction data from M-Pesa
      - `callback_received_at` (timestamptz) - When callback was received
      - `created_at` (timestamptz) - Record creation time
      - `updated_at` (timestamptz) - Last update time

  2. Security
    - Enable RLS on `transactions` table
    - Add policy for service role access (for edge functions)
    - Add policy for authenticated users to read their own transactions

  3. Indexes
    - Index on `checkout_request_id` for fast lookups
    - Index on `phone_number` for customer transaction history
    - Index on `status` for filtering transactions
*/

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id text UNIQUE NOT NULL,
  merchant_request_id text,
  phone_number text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  result_code text,
  result_desc text,
  transaction_details jsonb DEFAULT '{}'::jsonb,
  callback_received_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Service role can manage all transactions"
  ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view transactions by phone number"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (phone_number = auth.jwt() ->> 'phone');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_checkout_request_id ON transactions(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_transactions_phone_number ON transactions(phone_number);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();