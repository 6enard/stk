import React, { useState } from 'react';
import { ShoppingCart, CreditCard, CheckCircle, Loader2, Phone, Package } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  description: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface PaymentData {
  phone: string;
  amount: number;
  items: CartItem[];
}

const products: Product[] = [
  {
    id: '1',
    name: 'Premium Headphones',
    price: 5500,
    image: 'https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'High-quality wireless headphones with noise cancellation'
  },
  {
    id: '2',
    name: 'Smart Watch',
    price: 12000,
    image: 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Feature-rich smartwatch with health monitoring'
  },
  {
    id: '3',
    name: 'Wireless Speaker',
    price: 8500,
    image: 'https://images.pexels.com/photos/1649771/pexels-photo-1649771.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Portable Bluetooth speaker with premium sound quality'
  },
  {
    id: '4',
    name: 'Phone Case',
    price: 1200,
    image: 'https://images.pexels.com/photos/4526412/pexels-photo-4526412.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Durable protective case for smartphones'
  },
  {
    id: '5',
    name: 'Power Bank',
    price: 3500,
    image: 'https://images.pexels.com/photos/4526427/pexels-photo-4526427.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: '20000mAh fast-charging power bank'
  },
  {
    id: '6',
    name: 'USB Cable',
    price: 800,
    image: 'https://images.pexels.com/photos/163125/circuit-circuit-board-resistor-computer-163125.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'High-speed USB-C charging cable'
  }
];

function App() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity === 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const getTotalAmount = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const formatCurrency = (amount: number) => {
    return `KSh ${amount.toLocaleString()}`;
  };

  const formatPhoneNumber = (phone: string) => {
    // Convert to 254 format
    let formatted = phone.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
      formatted = '254' + formatted.slice(1);
    } else if (!formatted.startsWith('254')) {
      formatted = '254' + formatted;
    }
    return formatted;
  };

  const initiatePayment = async () => {
    if (!phoneNumber || cart.length === 0) return;

    setPaymentStatus('processing');
    
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      const amount = getTotalAmount();

      const response = await fetch('/api/stk-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: formattedPhone,
          amount: amount,
          items: cart
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTransactionId(data.checkoutRequestId);
        // Poll for payment status
        pollPaymentStatus(data.checkoutRequestId);
      } else {
        setPaymentStatus('failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('failed');
    }
  };

  const pollPaymentStatus = async (checkoutRequestId: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    const poll = async () => {
      try {
        const response = await fetch(`/api/payment-status?checkoutRequestId=${checkoutRequestId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          setPaymentStatus('success');
          setCart([]); // Clear cart on successful payment
        } else if (data.status === 'failed' || attempts >= maxAttempts) {
          setPaymentStatus('failed');
        } else {
          attempts++;
          setTimeout(poll, 2000); // Check every 2 seconds
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          setPaymentStatus('failed');
        } else {
          setTimeout(poll, 2000);
        }
      }
    };

    poll();
  };

  const resetPayment = () => {
    setPaymentStatus('idle');
    setShowPayment(false);
    setPhoneNumber('');
    setTransactionId('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Package className="h-8 w-8 text-emerald-600" />
              <h1 className="text-xl font-bold text-gray-900">TechStore</h1>
            </div>
            
            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              <span>Cart</span>
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {cart.reduce((total, item) => total + item.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-emerald-600 to-blue-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">Premium Tech Accessories</h2>
          <p className="text-xl mb-8">Pay instantly with M-Pesa STK Push</p>
          <div className="flex justify-center items-center space-x-4">
            <Phone className="h-6 w-6" />
            <span className="font-semibold">Secure Mobile Payments</span>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h3 className="text-2xl font-bold text-gray-900 mb-8">Featured Products</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow overflow-hidden">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-2">{product.name}</h4>
                <p className="text-gray-600 text-sm mb-4">{product.description}</p>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-emerald-600">{formatCurrency(product.price)}</span>
                  <button
                    onClick={() => addToCart(product)}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center space-x-2"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Shopping Cart</h3>
                <button
                  onClick={() => setShowCart(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {cart.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Your cart is empty</p>
              ) : (
                <>
                  <div className="space-y-4 mb-6">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-3 border-b">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{item.name}</h4>
                          <p className="text-emerald-600 font-medium">{formatCurrency(item.price)}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="text-gray-500 hover:text-gray-700 w-6 h-6 flex items-center justify-center rounded border"
                          >
                            -
                          </button>
                          <span className="font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="text-gray-500 hover:text-gray-700 w-6 h-6 flex items-center justify-center rounded border"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-red-500 hover:text-red-700 ml-4"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xl font-bold text-gray-900">Total: {formatCurrency(getTotalAmount())}</span>
                    </div>
                    <button
                      onClick={() => {
                        setShowCart(false);
                        setShowPayment(true);
                      }}
                      className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center space-x-2"
                    >
                      <CreditCard className="h-5 w-5" />
                      <span>Proceed to Payment</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">M-Pesa Payment</h3>
                {paymentStatus === 'idle' && (
                  <button
                    onClick={() => setShowPayment(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="p-6">
              {paymentStatus === 'idle' && (
                <>
                  <div className="mb-6">
                    <div className="text-center mb-4">
                      <div className="bg-emerald-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                        <Phone className="h-8 w-8 text-emerald-600" />
                      </div>
                      <p className="text-gray-600">Enter your M-Pesa number to receive STK push</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">Total Amount:</span>
                        <span className="text-2xl font-bold text-emerald-600">{formatCurrency(getTotalAmount())}</span>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                        M-Pesa Phone Number
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="0700000000"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={initiatePayment}
                    disabled={!phoneNumber}
                    className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <CreditCard className="h-5 w-5" />
                    <span>Send STK Push</span>
                  </button>
                </>
              )}

              {paymentStatus === 'processing' && (
                <div className="text-center py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-emerald-600 mx-auto mb-4" />
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Processing Payment</h4>
                  <p className="text-gray-600 mb-4">Check your phone for M-Pesa STK push notification</p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      Please complete the payment on your phone. This may take up to 30 seconds.
                    </p>
                  </div>
                </div>
              )}

              {paymentStatus === 'success' && (
                <div className="text-center py-8">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h4>
                  <p className="text-gray-600 mb-4">Thank you for your purchase</p>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-green-800">
                      Transaction ID: {transactionId}
                    </p>
                  </div>
                  <button
                    onClick={resetPayment}
                    className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Continue Shopping
                  </button>
                </div>
              )}

              {paymentStatus === 'failed' && (
                <div className="text-center py-8">
                  <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">❌</span>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Payment Failed</h4>
                  <p className="text-gray-600 mb-6">Please try again or contact support</p>
                  <div className="space-y-3">
                    <button
                      onClick={() => setPaymentStatus('idle')}
                      className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={resetPayment}
                      className="w-full bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;