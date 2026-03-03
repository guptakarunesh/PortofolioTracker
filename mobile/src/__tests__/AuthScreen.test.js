import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../screens/AuthScreen';

jest.mock('../api/client', () => ({
  api: {
    getLegalVersions: jest.fn(async () => ({ privacyPolicyVersion: 'v1.0', termsVersion: 'v1.0' }))
  },
  buildApiUrl: (path) => path
}));

describe('AuthScreen', () => {
  it('switches to OTP login and triggers send/verify', async () => {
    const onLogin = jest.fn();
    const onRegister = jest.fn();
    const onLoginWithBiometric = jest.fn(() => Promise.resolve());
    const onRequestOtp = jest.fn(async () => ({ retry_after_seconds: 0 }));
    const onVerifyOtp = jest.fn(async () => ({}));

    const { getByText, getByPlaceholderText } = render(
      <AuthScreen
        onLogin={onLogin}
        onRegister={onRegister}
        onLoginWithBiometric={onLoginWithBiometric}
        onRequestOtp={onRequestOtp}
        onVerifyOtp={onVerifyOtp}
        loading={false}
      />
    );

    fireEvent.press(getByText('OTP Login'));
    fireEvent.changeText(getByPlaceholderText('10-digit Indian mobile'), '9999999999');
    fireEvent.press(getByText('Send OTP'));
    await waitFor(() => expect(onRequestOtp).toHaveBeenCalled());

    await waitFor(() => getByPlaceholderText('Enter OTP'));
    fireEvent.changeText(getByPlaceholderText('Enter OTP'), '123456');
    fireEvent.press(getByText('Verify OTP'));
    await waitFor(() => expect(onVerifyOtp).toHaveBeenCalled());
  });
});
