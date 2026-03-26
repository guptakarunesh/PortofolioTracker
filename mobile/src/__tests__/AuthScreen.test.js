import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../screens/AuthScreen';

jest.mock('../api/client', () => ({
  api: {
    getLegalVersions: jest.fn(async () => ({ privacyPolicyVersion: 'v1.1', termsVersion: 'v1.1' }))
  },
  buildApiUrl: (path) => path
}));

describe('AuthScreen', () => {
  it('switches to OTP login and triggers send/verify', async () => {
    const onRegister = jest.fn();
    const onLoginWithBiometric = jest.fn(() => Promise.resolve());
    const onRequestOtp = jest.fn(async () => ({ retry_after_seconds: 0 }));
    const onVerifyOtp = jest.fn(async () => ({}));

    const { getByText, getByPlaceholderText, findByPlaceholderText, findByText } = render(
      <AuthScreen
        onRegister={onRegister}
        onLoginWithBiometric={onLoginWithBiometric}
        onRequestOtp={onRequestOtp}
        onVerifyOtp={onVerifyOtp}
        loading={false}
      />
    );

    fireEvent.changeText(getByPlaceholderText('10-digit Indian mobile'), '9999999999');
    fireEvent.press(getByText('Send OTP'));
    await waitFor(() => expect(onRequestOtp).toHaveBeenCalled());

    const otpInput = await findByPlaceholderText('Enter OTP');
    fireEvent.changeText(otpInput, '123456');
    fireEvent.press(await findByText('Verify OTP'));
    await waitFor(() => expect(onVerifyOtp).toHaveBeenCalled());
  });

  it('clears stale external errors before a new OTP attempt', async () => {
    const onClearExternalMessage = jest.fn();
    const onRequestOtp = jest.fn(async () => ({ retry_after_seconds: 0 }));

    const { getByText, getByPlaceholderText, queryByText } = render(
      <AuthScreen
        onRegister={jest.fn()}
        onLoginWithBiometric={jest.fn(() => Promise.resolve())}
        onRequestOtp={onRequestOtp}
        onVerifyOtp={jest.fn(async () => ({}))}
        loading={false}
        externalMessage="Old login error"
        onClearExternalMessage={onClearExternalMessage}
      />
    );

    expect(getByText('Old login error')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('10-digit Indian mobile'), '9999999999');
    fireEvent.press(getByText('Send OTP'));

    await waitFor(() => expect(onRequestOtp).toHaveBeenCalled());
    expect(onClearExternalMessage).toHaveBeenCalled();
    expect(queryByText('Old login error')).toBeNull();
    expect(getByText('OTP sent to your mobile number.')).toBeTruthy();
  });
});
