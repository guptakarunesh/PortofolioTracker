const DEFAULT_PROVIDER = 'cashfree';

export function getPaymentProvider(requestedProvider) {
  return requestedProvider || process.env.PAYMENT_PROVIDER || DEFAULT_PROVIDER;
}

export function createCheckoutSession({ userId, plan, amount, period, provider }) {
  const activeProvider = getPaymentProvider(provider);
  const baseUrl = process.env.PAYMENT_CHECKOUT_BASE_URL;

  if (!baseUrl) {
    const error = new Error('PAYMENT_CHECKOUT_BASE_URL is not configured on the server.');
    error.code = 'payment_not_configured';
    throw error;
  }

  const url = new URL(baseUrl);
  url.searchParams.set('plan', plan);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('period', String(period));
  url.searchParams.set('user', String(userId));
  url.searchParams.set('provider', activeProvider);

  return { provider: activeProvider, checkoutUrl: url.toString() };
}
