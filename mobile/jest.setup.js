jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      firebase: {
        apiKey: 'test-api-key',
        projectId: 'test-project',
        appId: '1:1234567890:web:test',
        authDomain: 'test-project.firebaseapp.com'
      }
    }
  },
  manifest: {},
  manifest2: {}
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true }))
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {})
}));

jest.mock('expo-firebase-recaptcha', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FirebaseRecaptchaVerifierModal = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      verify: async () => 'test-recaptcha-token'
    }));
    return React.createElement(View, { testID: 'firebase-recaptcha-modal' });
  });
  return { FirebaseRecaptchaVerifierModal };
});
