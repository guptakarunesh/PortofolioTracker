import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AccountScreen from '../screens/AccountScreen';
import { api } from '../api/client';
import { sanitizeSubscriptionHistory } from '../utils/accountData';

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///tmp/',
  cacheDirectory: 'file:///tmp/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(async () => {})
}), { virtual: true });

jest.mock('../api/client', () => ({
  api: {
    getSettings: jest.fn(async () => ({})),
    getSubscriptionStatus: jest.fn(async () => ({})),
    getSubscriptionHistory: jest.fn(async () => []),
    upsertSettings: jest.fn(async () => ({})),
    exportUserData: jest.fn(async () => ({})),
    deleteAccount: jest.fn(async () => ({}))
  },
  buildApiUrl: (path) => path
}));

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getSettings.mockResolvedValue({});
    api.getSubscriptionStatus.mockResolvedValue({});
    api.getSubscriptionHistory.mockResolvedValue([]);
  });

  it('routes to family management when premium is active', () => {
    api.getSubscriptionStatus.mockImplementation(() => new Promise(() => {}));
    api.getSubscriptionHistory.mockImplementation(() => new Promise(() => {}));
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
    api.getSubscriptionStatus.mockImplementation(() => new Promise(() => {}));
    api.getSubscriptionHistory.mockImplementation(() => new Promise(() => {}));
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

  it('hides the save security pin action once a pin is already set', async () => {
    api.getSettings.mockResolvedValue({ privacy_pin: '1234' });

    const { getByText, queryByText } = render(
      <AccountScreen
        user={{ full_name: 'User' }}
        onLogout={() => {}}
        onPrivacyConfigChanged={() => {}}
        onCurrencyChanged={() => {}}
        biometricEnrolled={false}
        onEnrollBiometric={() => {}}
        onDisableBiometric={() => {}}
        subscriptionStatus={{ status: 'active', plan: 'basic_monthly' }}
        onOpenSubscription={() => {}}
        onOpenFamily={() => {}}
        premiumActive={false}
        preferredCurrency="INR"
        onThemeChange={() => {}}
        themeKey="teal"
      />
    );

    await waitFor(() => {
      expect(getByText('PIN Enabled')).toBeTruthy();
    });

    expect(queryByText('Save Security PIN')).toBeNull();
  });

  it('filters malformed subscription history rows before rendering', () => {
    expect(
      sanitizeSubscriptionHistory([
        null,
        undefined,
        false,
        0,
        'bad-row',
        { id: 42, plan: 'premium_monthly' }
      ])
    ).toEqual([{ id: 42, plan: 'premium_monthly' }]);
  });
});
