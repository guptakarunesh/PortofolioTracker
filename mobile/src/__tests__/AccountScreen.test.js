import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AccountScreen from '../screens/AccountScreen';

jest.mock('../api/client', () => ({
  api: {
    getSettings: jest.fn(async () => ({})),
    getSubscriptionStatus: jest.fn(async () => ({})),
    upsertSettings: jest.fn(async () => ({})),
    exportUserData: jest.fn(async () => ({})),
    deleteAccount: jest.fn(async () => ({}))
  },
  buildApiUrl: (path) => path
}));

describe('AccountScreen', () => {
  it('routes to family management when premium is active', () => {
    const onOpenFamily = jest.fn();
    const onOpenSubscription = jest.fn();
    const { getByText } = render(
      <AccountScreen
        user={{ full_name: 'User' }}
        onLogout={() => {}}
        onPrivacyConfigChanged={() => {}}
        onCurrencyChanged={() => {}}
        biometricEnrolled={false}
        onEnrollBiometric={() => {}}
        onDisableBiometric={() => {}}
        subscriptionStatus={{ status: 'active', plan: 'premium_monthly' }}
        onOpenSubscription={onOpenSubscription}
        onOpenFamily={onOpenFamily}
        premiumActive
        preferredCurrency="INR"
        onThemeChange={() => {}}
        themeKey="teal"
      />
    );

    fireEvent.press(getByText('Manage Family'));
    expect(onOpenFamily).toHaveBeenCalled();
  });

  it('routes to subscription when premium is inactive', () => {
    const onOpenFamily = jest.fn();
    const onOpenSubscription = jest.fn();
    const { getByText } = render(
      <AccountScreen
        user={{ full_name: 'User' }}
        onLogout={() => {}}
        onPrivacyConfigChanged={() => {}}
        onCurrencyChanged={() => {}}
        biometricEnrolled={false}
        onEnrollBiometric={() => {}}
        onDisableBiometric={() => {}}
        subscriptionStatus={{ status: 'expired', plan: 'none' }}
        onOpenSubscription={onOpenSubscription}
        onOpenFamily={onOpenFamily}
        premiumActive={false}
        preferredCurrency="INR"
        onThemeChange={() => {}}
        themeKey="teal"
      />
    );

    fireEvent.press(getByText('Manage Family'));
    expect(onOpenSubscription).toHaveBeenCalled();
  });
});
