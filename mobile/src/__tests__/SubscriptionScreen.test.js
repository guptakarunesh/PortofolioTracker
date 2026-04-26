import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import SubscriptionScreen from '../screens/SubscriptionScreen';

jest.mock('react-native-webview', () => ({
  WebView: 'WebView'
}));

jest.mock('../payments', () => ({
  startCheckout: jest.fn(),
  verifyCheckout: jest.fn()
}));

jest.mock('../payments/googlePlay', () => ({
  deriveGooglePlayOfferToken: jest.fn(() => null),
  initGooglePlayBilling: jest.fn(async () => ({ available: false, end: jest.fn(async () => {}) }))
}));

jest.mock('../api/client', () => ({
  isGuestPreviewActive: jest.fn(() => false),
  api: {
    getSubscriptionStatus: jest.fn(async () => ({
      plan: 'basic_monthly',
      status: 'active',
      provider: 'manual',
      limits: { maxAssets: 10, maxLiabilities: 5 }
    })),
    getGooglePlaySubscriptionConfig: jest.fn(async () => ({
      enabled: false,
      allowWebFallback: false,
      productMap: {}
    })),
    syncGooglePlaySubscriptions: jest.fn(async () => ({})),
    verifyGooglePlaySubscription: jest.fn(async () => ({}))
  }
}));

describe('SubscriptionScreen', () => {
  it('keeps worthio feature list copy and shows net worth trend for both plans', async () => {
    const { getByText, queryByText } = render(
      <SubscriptionScreen onClose={() => {}} onPurchased={() => {}} user={{ id: 1, full_name: 'User' }} />
    );

    await waitFor(() => {
      expect(getByText('Worthio Feature List')).toBeTruthy();
    });

    expect(getByText('Net Worth Trend')).toBeTruthy();
    expect(queryByText('Account Management')).toBeNull();
  });
});
