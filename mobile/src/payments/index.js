import { api } from '../api/client';

let RazorpayCheckout = null;
try {
  // eslint-disable-next-line global-require
  const mod = require('react-native-razorpay');
  RazorpayCheckout = mod?.default || mod;
} catch (_e) {
  RazorpayCheckout = null;
}

function isRazorpayUnavailable(error) {
  return String(error?.message || '').includes('razorpay_not_configured');
}

export async function startCheckout(plan, { user, fallback } = {}) {
  if (!RazorpayCheckout) {
    const err = new Error('Razorpay checkout requires a development build (Expo Go does not support native modules).');
    err.code = 'razorpay_unavailable';
    if (fallback) {
      await fallback();
      return { mode: 'fallback' };
    }
    throw err;
  }

  try {
    const order = await api.createRazorpayOrder({ plan });
    const result = await RazorpayCheckout.open({
      key: order.key_id,
      amount: String(order.amount),
      currency: order.currency || 'INR',
      name: 'Networth Manager',
      description: `Subscription: ${plan}`,
      order_id: order.order_id,
      prefill: {
        name: user?.full_name || '',
        email: user?.email || '',
        contact: user?.mobile || ''
      },
      notes: {
        plan
      },
      theme: { color: '#0f766e' }
    });

    await api.verifyRazorpayPayment({
      plan,
      razorpay_order_id: result.razorpay_order_id,
      razorpay_payment_id: result.razorpay_payment_id,
      razorpay_signature: result.razorpay_signature
    });

    return { mode: 'razorpay', result };
  } catch (e) {
    if (fallback && isRazorpayUnavailable(e)) {
      await fallback();
      return { mode: 'fallback' };
    }
    throw e;
  }
}
