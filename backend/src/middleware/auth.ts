import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'technician' | 'viewer';
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
      admin: 3,
      technician: 2,
      viewer: 1,
    };

    const userLevel = roleHierarchy[payload.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  }

  hashPassword(password: string): string {
    // Simple hash for dev purposes. In production use bcrypt.
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
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
}
