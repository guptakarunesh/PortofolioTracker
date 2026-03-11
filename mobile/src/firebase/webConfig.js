import Constants from 'expo-constants';

function fromEnv(name) {
  return String(process.env[name] || '').trim();
}

function fromExpoExtra(key) {
  return String(
    Constants?.expoConfig?.extra?.firebase?.[key] ||
      Constants?.manifest2?.extra?.firebase?.[key] ||
      ''
  ).trim();
}

function getValue(key, envKey) {
  return fromEnv(envKey) || fromExpoExtra(key);
}

export function getFirebaseWebConfig() {
  const apiKey = getValue('apiKey', 'EXPO_PUBLIC_FIREBASE_API_KEY');
  const projectId = getValue('projectId', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const appId = getValue('appId', 'EXPO_PUBLIC_FIREBASE_APP_ID');
  const authDomain =
    getValue('authDomain', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ||
    (projectId ? `${projectId}.firebaseapp.com` : '');

  if (!apiKey || !projectId || !appId || !authDomain) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    appId
  };
}

export function isFirebaseWebConfigReady() {
  return Boolean(getFirebaseWebConfig());
}
