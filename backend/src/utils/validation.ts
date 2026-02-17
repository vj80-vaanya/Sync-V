const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

export function isValidSha256(hash: string): boolean {
  return SHA256_HEX_REGEX.test(hash);
}

export function isValidDeviceId(id: string): boolean {
  if (!id || id.length === 0 || id.length > 128) return false;
  // Allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function isValidFilename(filename: string): boolean {
  if (!filename || filename.length === 0 || filename.length > 255) return false;
  // Reject path traversal, directory separators, null bytes
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  if (filename.includes('\0')) return false;
  // Reject drive letters
  if (filename.length >= 2 && filename[1] === ':') return false;
  return true;
}
