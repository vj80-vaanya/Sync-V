import { isValidSha256, isValidDeviceId, isValidFilename, isValidVendor, isValidLogFormat } from '../src/utils/validation';

describe('Validation Utilities', () => {
  describe('isValidSha256', () => {
    it('should accept valid SHA256 hex string', () => {
      expect(isValidSha256('a'.repeat(64))).toBe(true);
      expect(isValidSha256('0123456789abcdef'.repeat(4))).toBe(true);
    });

    it('should reject uppercase hex', () => {
      expect(isValidSha256('A'.repeat(64))).toBe(false);
    });

    it('should reject wrong length', () => {
      expect(isValidSha256('a'.repeat(63))).toBe(false);
      expect(isValidSha256('a'.repeat(65))).toBe(false);
      expect(isValidSha256('')).toBe(false);
    });

    it('should reject non-hex characters', () => {
      expect(isValidSha256('g'.repeat(64))).toBe(false);
      expect(isValidSha256('z'.repeat(64))).toBe(false);
    });
  });

  describe('isValidDeviceId', () => {
    it('should accept valid device IDs', () => {
      expect(isValidDeviceId('PUMP-001')).toBe(true);
      expect(isValidDeviceId('device_123')).toBe(true);
      expect(isValidDeviceId('abc')).toBe(true);
      expect(isValidDeviceId('ABC123')).toBe(true);
    });

    it('should reject empty or missing IDs', () => {
      expect(isValidDeviceId('')).toBe(false);
    });

    it('should reject IDs exceeding max length', () => {
      expect(isValidDeviceId('a'.repeat(129))).toBe(false);
    });

    it('should accept IDs at max length', () => {
      expect(isValidDeviceId('a'.repeat(128))).toBe(true);
    });

    it('should reject IDs with special characters', () => {
      expect(isValidDeviceId('device..001')).toBe(false);
      expect(isValidDeviceId('device/001')).toBe(false);
      expect(isValidDeviceId('device 001')).toBe(false);
      expect(isValidDeviceId('device@001')).toBe(false);
    });
  });

  describe('isValidFilename', () => {
    it('should accept valid filenames', () => {
      expect(isValidFilename('data.csv')).toBe(true);
      expect(isValidFilename('firmware_v2.0.bin')).toBe(true);
      expect(isValidFilename('log-2024-01-15.txt')).toBe(true);
    });

    it('should reject empty filename', () => {
      expect(isValidFilename('')).toBe(false);
    });

    it('should reject filenames exceeding 255 chars', () => {
      expect(isValidFilename('a'.repeat(256))).toBe(false);
    });

    it('should accept filenames at max length', () => {
      expect(isValidFilename('a'.repeat(255))).toBe(true);
    });

    it('should reject path traversal', () => {
      expect(isValidFilename('../etc/passwd')).toBe(false);
      expect(isValidFilename('..\\windows\\system32')).toBe(false);
    });

    it('should reject directory separators', () => {
      expect(isValidFilename('dir/file.txt')).toBe(false);
      expect(isValidFilename('dir\\file.txt')).toBe(false);
    });

    it('should reject null bytes', () => {
      expect(isValidFilename('file\0.txt')).toBe(false);
    });

    it('should reject drive letters', () => {
      expect(isValidFilename('C:file.txt')).toBe(false);
    });
  });

  describe('isValidVendor', () => {
    it('should accept valid vendor names', () => {
      expect(isValidVendor('Siemens')).toBe(true);
      expect(isValidVendor('ABB')).toBe(true);
      expect(isValidVendor('Schneider Electric')).toBe(true);
      expect(isValidVendor('Honeywell-Process')).toBe(true);
      expect(isValidVendor('vendor.v2')).toBe(true);
    });

    it('should reject empty vendor', () => {
      expect(isValidVendor('')).toBe(false);
    });

    it('should reject vendor exceeding 128 chars', () => {
      expect(isValidVendor('a'.repeat(129))).toBe(false);
    });

    it('should accept vendor at max length', () => {
      expect(isValidVendor('a'.repeat(128))).toBe(true);
    });

    it('should reject vendor with special characters', () => {
      expect(isValidVendor('vendor@evil')).toBe(false);
      expect(isValidVendor('vendor<script>')).toBe(false);
      expect(isValidVendor('vendor;drop')).toBe(false);
    });
  });

  describe('isValidLogFormat', () => {
    it('should accept all valid formats', () => {
      expect(isValidLogFormat('text')).toBe(true);
      expect(isValidLogFormat('json')).toBe(true);
      expect(isValidLogFormat('csv')).toBe(true);
      expect(isValidLogFormat('syslog')).toBe(true);
      expect(isValidLogFormat('xml')).toBe(true);
      expect(isValidLogFormat('binary')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidLogFormat('pdf')).toBe(false);
      expect(isValidLogFormat('html')).toBe(false);
      expect(isValidLogFormat('')).toBe(false);
      expect(isValidLogFormat('TEXT')).toBe(false);
    });
  });
});
