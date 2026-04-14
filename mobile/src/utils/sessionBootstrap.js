export function resolveSessionBootstrap(savedToken, guestPreviewActive) {
  const token = String(savedToken || '').trim();
  if (token) {
    return { mode: 'authenticated', token };
  }
  if (guestPreviewActive) {
    return { mode: 'guest', token: '' };
  }
  return { mode: 'signed_out', token: '' };
}
