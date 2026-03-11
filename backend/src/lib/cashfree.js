const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';

function resolveBaseUrl() {
  const env = String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
  if (env === 'production' || env === 'prod') {
    return 'https://api.cashfree.com/pg';
  }
  return 'https://sandbox.cashfree.com/pg';
}

function getCashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID || '';
  const secretKey = process.env.CASHFREE_SECRET_KEY || '';
  if (!appId || !secretKey) {
    const error = new Error('Cashfree credentials are not configured on the server.');
    error.code = 'cashfree_not_configured';
    throw error;
  }
  return {
    appId,
    secretKey,
    baseUrl: resolveBaseUrl()
  };
}

async function cashfreeRequest(path, { method = 'GET', body } = {}) {
  const { appId, secretKey, baseUrl } = getCashfreeConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': CASHFREE_API_VERSION
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_e) {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail = payload?.message || payload?.error || response.statusText || 'Cashfree request failed';
    const error = new Error(String(detail));
    error.code = 'cashfree_api_error';
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload || {};
}

function normalizeIndianPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return '9999999999';
}

export async function createCashfreeOrder({
  orderId,
  amountInr,
  customer,
  returnUrl,
  notifyUrl,
  orderNote
}) {
  const customerPhone = normalizeIndianPhone(customer?.phone || '');
  const customerId = String(customer?.id || '').trim() || `user_${Date.now()}`;
  const customerName = String(customer?.name || '').trim() || 'Networth Manager User';
  const customerEmailRaw = String(customer?.email || '').trim();
  const customerEmail = customerEmailRaw || `${customerId}@networthmanager.app`;

  const body = {
    order_id: orderId,
    order_amount: Number(amountInr),
    order_currency: 'INR',
    customer_details: {
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail
    }
  };

  if (returnUrl || notifyUrl || orderNote) {
    body.order_meta = {};
    if (returnUrl) body.order_meta.return_url = returnUrl;
    if (notifyUrl) body.order_meta.notify_url = notifyUrl;
    if (orderNote) body.order_meta.payment_note = orderNote;
  }

  const payload = await cashfreeRequest('/orders', {
    method: 'POST',
    body
  });

  return {
    orderId: payload.order_id || orderId,
    orderStatus: payload.order_status || null,
    paymentSessionId: payload.payment_session_id || null,
    checkoutUrl: payload.payment_link || payload.order_meta?.payment_link || null,
    raw: payload
  };
}

export async function verifyCashfreeOrderPaid(orderId) {
  const paymentsPayload = await cashfreeRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
  const payments = Array.isArray(paymentsPayload) ? paymentsPayload : [];
  const paidPayment = payments.find((p) => String(p?.payment_status || '').toUpperCase() === 'SUCCESS');

  if (paidPayment) {
    return {
      paid: true,
      paymentId: paidPayment.cf_payment_id || paidPayment.payment_id || null,
      orderStatus: 'PAID',
      raw: { payments }
    };
  }

  const orderPayload = await cashfreeRequest(`/orders/${encodeURIComponent(orderId)}`);
  const isPaid = String(orderPayload?.order_status || '').toUpperCase() === 'PAID';
  return {
    paid: isPaid,
    paymentId: null,
    orderStatus: orderPayload?.order_status || null,
    raw: { order: orderPayload, payments }
  };
}
