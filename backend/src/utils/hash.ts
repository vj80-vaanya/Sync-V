import crypto from 'crypto';

export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function verifySha256(data: string, expectedHash: string): boolean {
  return sha256(data) === expectedHash;
}
