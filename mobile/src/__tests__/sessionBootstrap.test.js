import { resolveSessionBootstrap } from '../utils/sessionBootstrap';

describe('resolveSessionBootstrap', () => {
  it('prefers an authenticated session when a token is present', () => {
    expect(resolveSessionBootstrap('token-123', true)).toEqual({
      mode: 'authenticated',
      token: 'token-123'
    });
  });

  it('restores guest preview when no auth token exists but guest mode is active', () => {
    expect(resolveSessionBootstrap('', true)).toEqual({
      mode: 'guest',
      token: ''
    });
  });

  it('returns signed out when neither auth nor guest preview is active', () => {
    expect(resolveSessionBootstrap('', false)).toEqual({
      mode: 'signed_out',
      token: ''
    });
  });
});
