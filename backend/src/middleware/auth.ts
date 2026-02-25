import jwt from 'jsonwebtoken';
import * as argon2 from 'argon2';

export interface TokenPayload {
  userId: string;
  username: string;
  role: 'platform_admin' | 'org_admin' | 'technician' | 'viewer';
  orgId?: string;
  authType?: 'jwt' | 'api_key';
  permissions?: string[];
}

export class AuthService {
  private secret: string;
  private expiresInSeconds: number;

  constructor(secret: string, expiresIn: string = '24h') {
    this.secret = secret;
    this.expiresInSeconds = this.parseExpiry(expiresIn);
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 86400; // default 24h
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 86400;
    }
  }

  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresInSeconds });
  }

  validateToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  hasRole(token: string, requiredRole: string): boolean {
    const payload = this.validateToken(token);
    if (!payload) return false;

    const roleHierarchy: Record<string, number> = {
      platform_admin: 4,
      org_admin: 3,
      technician: 2,
      viewer: 1,
      // Legacy compatibility
      admin: 3,
    };

    const userLevel = roleHierarchy[payload.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    // Support legacy SHA256 hashes during migration
    if (/^[0-9a-f]{64}$/.test(hash)) {
      const crypto = require('crypto');
      const sha256 = crypto.createHash('sha256').update(password).digest('hex');
      return sha256 === hash;
    }
    // Support legacy bcrypt hashes during migration
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      const bcryptjs = require('bcryptjs');
      return bcryptjs.compareSync(password, hash);
    }
    return argon2.verify(hash, password);
  }
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Prune stale entries every 5 minutes to prevent unbounded growth
    this.pruneTimer = setInterval(() => this.prune(), 5 * 60000);
    this.pruneTimer.unref();
  }

  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(clientId) || [];

    // Remove expired timestamps
    const valid = timestamps.filter((t) => now - t < this.windowMs);

    if (valid.length >= this.maxRequests) {
      this.requests.set(clientId, valid);
      return false;
    }

    valid.push(now);
    this.requests.set(clientId, valid);
    return true;
  }

  reset(clientId: string): void {
    this.requests.delete(clientId);
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests) {
      const valid = timestamps.filter(t => now - t < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }

  destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }
}

export class FailedLoginTracker {
  private attempts: Map<string, { count: number; firstAttempt: number; lockedUntil: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;
  private lockoutMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000, lockoutMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.lockoutMs = lockoutMs;
  }

  isLocked(key: string): boolean {
    const entry = this.attempts.get(key);
    if (!entry) return false;
    const now = Date.now();
    if (entry.lockedUntil > 0 && now < entry.lockedUntil) return true;
    if (entry.lockedUntil > 0 && now >= entry.lockedUntil) {
      this.attempts.delete(key);
      return false;
    }
    if (now - entry.firstAttempt > this.windowMs) {
      this.attempts.delete(key);
      return false;
    }
    return false;
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAttempt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAttempt: now, lockedUntil: 0 });
      return;
    }
    entry.count++;
    if (entry.count >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
    }
    this.attempts.set(key, entry);
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  getRemainingAttempts(key: string): number {
    const entry = this.attempts.get(key);
    if (!entry) return this.maxAttempts;
    if (Date.now() - entry.firstAttempt > this.windowMs) return this.maxAttempts;
    return Math.max(0, this.maxAttempts - entry.count);
  }
}
