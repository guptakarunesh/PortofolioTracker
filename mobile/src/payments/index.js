import { api } from '../api/client';
import Constants from 'expo-constants';

function getAppReturnUrl() {
  const linkingUri = String(Constants?.linkingUri || '').trim();
  if (linkingUri) {
    if (linkingUri.endsWith('/')) {
      return `${linkingUri}subscription-return`;
    }
    return `${linkingUri}/subscription-return`;
  }

  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoClient?.hostUri ||
    Constants?.manifest?.debuggerHost ||
    '';
  const host = String(hostUri || '').split(':')[0];
  if (host) {
    return `exp://${host}:8081/--/subscription-return`;
  }
  return 'worthio://subscription-return';
}

export async function startCheckout(plan, { user, fallback } = {}) {
  void user;

  try {
    const appReturnUrl = getAppReturnUrl();
    const order = await api.createCashfreeOrder({ plan, app_return_url: appReturnUrl });
    const checkoutUrl = String(order?.checkout_url || '').trim();
    if (!checkoutUrl) {
      const err = new Error('Cashfree checkout link is not available from server.');
      err.code = 'cashfree_checkout_url_missing';
      throw err;
    }
    return { mode: 'cashfree', orderId: order.order_id, plan, checkoutUrl };
  } catch (e) {
    const code = String(e?.code || '');
    if (fallback && (code === 'cashfree_not_configured' || code === 'payment_not_configured')) {
      await fallback();
      return { mode: 'fallback' };
    }
    throw e;
  }
}

export async function verifyCheckout(plan, orderId) {
  if (!plan || !orderId) {
    const err = new Error('plan and orderId are required for payment verification.');
    err.code = 'cashfree_verify_missing_fields';
    throw err;
  }
  return api.verifyCashfreePayment({ plan, order_id: orderId });
}
