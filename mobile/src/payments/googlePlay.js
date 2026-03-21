import { Platform } from 'react-native';

let cachedIap = null;

function getIap() {
  if (!cachedIap) {
    // eslint-disable-next-line global-require
    cachedIap = require('react-native-iap');
  }
  return cachedIap;
}

function buildGoogleSubscriptionRequest({ productId, obfuscatedAccountId, currentPurchaseToken, offerToken }) {
  const googleRequest = {
    skus: [productId],
    obfuscatedAccountId: obfuscatedAccountId || undefined,
    purchaseToken: currentPurchaseToken || undefined,
    subscriptionOffers: offerToken ? [{ sku: productId, offerToken }] : undefined
  };
  return {
    type: 'subs',
    request: {
      android: googleRequest,
      google: googleRequest
    }
  };
}

function normalizeProductList(result) {
  return Array.isArray(result) ? result : [];
}

export function deriveGooglePlayOfferToken(product) {
  const offers = Array.isArray(product?.subscriptionOffers) ? product.subscriptionOffers : [];
  return String(offers.find((offer) => String(offer?.offerTokenAndroid || '').trim())?.offerTokenAndroid || '').trim() || null;
}

export async function initGooglePlayBilling({ onPurchaseSuccess, onPurchaseError } = {}) {
  if (Platform.OS !== 'android') {
    return {
      available: false,
      reason: 'not_android',
      end: async () => {}
    };
  }

  const iap = getIap();
  const connected = await iap.initConnection();
  const purchaseUpdateSubscription = iap.purchaseUpdatedListener(async (purchase) => {
    await onPurchaseSuccess?.(purchase);
  });
  const purchaseErrorSubscription = iap.purchaseErrorListener(async (error) => {
    await onPurchaseError?.(error);
  });

  return {
    available: Boolean(connected),
    fetchSubscriptions: async (productIds) => {
      const ids = Array.from(new Set((productIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
      if (!ids.length) return [];
      return normalizeProductList(await iap.fetchProducts({ skus: ids, type: 'subs' }));
    },
    getAvailablePurchases: async () => normalizeProductList(await iap.getAvailablePurchases({})),
    requestSubscription: async ({ productId, obfuscatedAccountId, currentPurchaseToken, offerToken }) =>
      iap.requestPurchase(
        buildGoogleSubscriptionRequest({
          productId,
          obfuscatedAccountId,
          currentPurchaseToken,
          offerToken
        })
      ),
    finishPurchase: async (purchase) => iap.finishTransaction({ purchase, isConsumable: false }),
    end: async () => {
      purchaseUpdateSubscription?.remove?.();
      purchaseErrorSubscription?.remove?.();
      await iap.endConnection().catch(() => {});
    }
  };
}
