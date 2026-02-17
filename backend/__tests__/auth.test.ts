import { AuthService, RateLimiter } from '../src/middleware/auth';

describe('Auth Service', () => {
  let authService: AuthService;
  const SECRET = 'test-secret-key-for-jwt-signing';

  beforeEach(() => {
    authService = new AuthService(SECRET, '1h');
  });

  test('generates JWT token', () => {
    const token = authService.generateToken({
      userId: 'user-1',
      username: 'admin',
      role: 'admin',
    });

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT format
  });

  test('validates correct token', () => {
    const token = authService.generateToken({
      userId: 'user-1',
      username: 'tech1',
      role: 'technician',
    });

    const payload = authService.validateToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe('user-1');
    expect(payload!.username).toBe('tech1');
    expect(payload!.role).toBe('technician');
  });

  test('rejects invalid token', () => {
    const payload = authService.validateToken('invalid.token.here');
    expect(payload).toBeNull();
  });

  test('rejects expired token', () => {
    const shortLived = new AuthService(SECRET, '0s');
    const token = shortLived.generateToken({
      userId: 'user-1',
      username: 'admin',
      role: 'admin',
    });

    // Token should be expired immediately
    const payload = shortLived.validateToken(token);
    expect(payload).toBeNull();
  });

  test('enforces role-based access - admin has full access', () => {
    const token = authService.generateToken({
      userId: 'user-1',
      username: 'admin',
      role: 'admin',
    });

    expect(authService.hasRole(token, 'viewer')).toBe(true);
    expect(authService.hasRole(token, 'technician')).toBe(true);
    expect(authService.hasRole(token, 'admin')).toBe(true);
  });

  test('enforces role-based access - technician limited', () => {
    const token = authService.generateToken({
      userId: 'user-2',
      username: 'tech1',
      role: 'technician',
    });

    expect(authService.hasRole(token, 'viewer')).toBe(true);
    expect(authService.hasRole(token, 'technician')).toBe(true);
    expect(authService.hasRole(token, 'admin')).toBe(false);
  });

  test('enforces role-based access - viewer most limited', () => {
    const token = authService.generateToken({
      userId: 'user-3',
      username: 'viewer1',
      role: 'viewer',
    });

    expect(authService.hasRole(token, 'viewer')).toBe(true);
    expect(authService.hasRole(token, 'technician')).toBe(false);
    expect(authService.hasRole(token, 'admin')).toBe(false);
  });

  test('rejects role check with invalid token', () => {
    expect(authService.hasRole('bad-token', 'viewer')).toBe(false);
  });

  test('hashes and verifies password', () => {
    const password = 'securePassword123!';
    const hash = authService.hashPassword(password);

    expect(hash).not.toBe(password);
    expect(authService.verifyPassword(password, hash)).toBe(true);
    expect(authService.verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('Rate Limiter', () => {
  test('allows requests within limit', () => {
    const limiter = new RateLimiter(5, 1000);

    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed('client-1')).toBe(true);
    }
  });

  test('blocks requests over limit', () => {
    const limiter = new RateLimiter(3, 60000);

    expect(limiter.isAllowed('client-1')).toBe(true);
    expect(limiter.isAllowed('client-1')).toBe(true);
    expect(limiter.isAllowed('client-1')).toBe(true);
    expect(limiter.isAllowed('client-1')).toBe(false);
  });

  test('tracks clients independently', () => {
    const limiter = new RateLimiter(2, 60000);

    expect(limiter.isAllowed('client-1')).toBe(true);
    expect(limiter.isAllowed('client-1')).toBe(true);
    expect(limiter.isAllowed('client-1')).toBe(false);

    // Different client should still be allowed
    expect(limiter.isAllowed('client-2')).toBe(true);
  });

  test('resets client limit', () => {
    const limiter = new RateLimiter(2, 60000);

    expect(limiter.isAllowed('client-1')).toBe(true);
    expect(limiter.isAllowed('client-1')).toBe(true);
    expect(limiter.isAllowed('client-1')).toBe(false);

    limiter.reset('client-1');
    expect(limiter.isAllowed('client-1')).toBe(true);
  });
});
