import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';

let pendingConfirmation = null;
let pendingMobile = '';

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
  return Platform.OS === 'android' || Platform.OS === 'ios';
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
