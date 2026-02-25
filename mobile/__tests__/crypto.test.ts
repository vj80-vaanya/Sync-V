import { getSessionKey, resetSessionKey, setSessionKey } from '../src/utils/crypto';

describe('Crypto utility (session key only)', () => {
  beforeEach(() => {
    resetSessionKey();
  });

  test('generates a session key', () => {
    const key = getSessionKey();
    expect(key).toBeTruthy();
    expect(key.length).toBe(64); // SHA256 hex output
  });

  test('session key is stable within a session', () => {
    const key1 = getSessionKey();
    const key2 = getSessionKey();
    expect(key1).toBe(key2);
  });

  test('resetSessionKey generates new key', () => {
    const key1 = getSessionKey();
    resetSessionKey();
    const key2 = getSessionKey();
    expect(key1).not.toBe(key2);
  });

  test('setSessionKey overrides key', () => {
    setSessionKey('custom-key-value');
    expect(getSessionKey()).toBe('custom-key-value');
  });
});
