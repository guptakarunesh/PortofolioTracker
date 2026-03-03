import crypto from 'node:crypto';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

function getRazorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    const error = new Error('Razorpay keys are not configured on the server.');
    error.code = 'razorpay_not_configured';
    throw error;
  }

  return { keyId, keySecret };
}

function buildBasicAuthHeader(keyId, keySecret) {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return `Basic ${token}`;
}

export async function createRazorpayOrder({ amountInr, receipt, notes }) {
  const { keyId, keySecret } = getRazorpayKeys();
  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildBasicAuthHeader(keyId, keySecret)
    },
    body: JSON.stringify({
      amount: Math.round(Number(amountInr) * 100),
      currency: 'INR',
      receipt,
      payment_capture: 1,
      notes: notes || {}
    })
  });

  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || 'Failed to create Razorpay order.');
    error.code = 'razorpay_order_failed';
    throw error;
  }

  const payload = text ? JSON.parse(text) : {};
  return {
    orderId: payload.id,
    amount: payload.amount,
    currency: payload.currency,
    keyId
  };
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const { keySecret } = getRazorpayKeys();
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return expected === signature;
}
