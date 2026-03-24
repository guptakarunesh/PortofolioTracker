import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';

let pendingConfirmation = null;
let pendingMobile = '';
const NATIVE_PHONE_AUTH_EXPLICITLY_ENABLED = String(process.env.EXPO_PUBLIC_ENABLE_NATIVE_PHONE_AUTH || '').trim() === '1';

function normalizeIndianMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function toE164(rawMobile) {
  const mobile = normalizeIndianMobile(rawMobile);
  return mobile ? `+91${mobile}` : '';
}

export function canUseNativePhoneAuth() {
  if (!(Platform.OS === 'android' || Platform.OS === 'ios')) return false;
  if (__DEV__ && !NATIVE_PHONE_AUTH_EXPLICITLY_ENABLED) return false;
  return true;
}

export function isNativePhoneAuthNetworkError(error) {
  const code = String(error?.code || '')
    .trim()
    .toLowerCase();
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();

  return (
    code === 'auth/network-request-failed' ||
    message.includes('network-request-failed') ||
    message.includes('network request failed') ||
    message.includes('a network error') ||
    message.includes('timeout') ||
    message.includes('unreachable host') ||
    message.includes('interrupted connection')
  );
}

export function formatNativePhoneAuthError(error) {
  if (isNativePhoneAuthNetworkError(error)) {
    return 'Connection issue. Please try again in a few seconds.';
  }
  const code = String(error?.code || '')
    .trim()
    .toLowerCase();
  if (code === 'auth/invalid-phone-number') {
    return 'Enter a valid 10-digit Indian mobile number.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a little and try again.';
  }
  if (code === 'auth/invalid-verification-code') {
    return 'The OTP you entered is incorrect. Please try again.';
  }
  if (code === 'auth/code-expired') {
    return 'This OTP has expired. Please request a new one.';
  }
  return String(error?.message || 'Unable to complete phone verification.');
}

export async function startNativePhoneOtp(rawMobile) {
  if (!canUseNativePhoneAuth()) {
    throw new Error('Native Firebase phone auth is not available on this platform.');
  }
  const phoneNumber = toE164(rawMobile);
  if (!phoneNumber) {
    throw new Error('Valid Indian mobile number is required');
  }

  const confirmation = await auth().signInWithPhoneNumber(phoneNumber);
  pendingConfirmation = confirmation;
  pendingMobile = normalizeIndianMobile(rawMobile);
  return {
    retry_after_seconds: 30,
    provider: 'firebase_native'
  };
}

export async function completeNativePhoneOtp(code) {
  if (!pendingConfirmation) {
    throw new Error('OTP session is missing. Please request OTP again.');
  }

  const confirmed = await pendingConfirmation.confirm(String(code || '').trim());
  const firebaseIdToken = await confirmed.user.getIdToken(true);

  try {
    await auth().signOut();
  } catch (_e) {
    // Ignore local Firebase sign-out failures after token capture.
  }

  const mobile = pendingMobile;
  pendingConfirmation = null;
  pendingMobile = '';

  return {
    mobile,
    firebase_id_token: firebaseIdToken
  };
}

export function clearNativePhoneOtp() {
  pendingConfirmation = null;
  pendingMobile = '';
}
