import { MetadataParserRegistry, parseTypeA, parseTypeB } from '../src/parsers/MetadataParser';
import { DeviceMetadata } from '../src/types/Device';

describe('Metadata Parsers', () => {
  describe('Type A Parser (key=value)', () => {
    test('parses valid type A metadata', () => {
      const raw = 'device_id=DEV001\nfirmware_version=1.2.3\nuptime_hours=1024\nstatus=running';
      const result = parseTypeA(raw);

      expect(result.deviceId).toBe('DEV001');
      expect(result.firmwareVersion).toBe('1.2.3');
      expect(result.fields['uptime_hours']).toBe('1024');
      expect(result.fields['status']).toBe('running');
      expect(result.parseSuccessful).toBe(true);
    });

    test('handles empty input', () => {
      const result = parseTypeA('');
      expect(result.parseSuccessful).toBe(false);
    });

    test('handles malformed data', () => {
      const result = parseTypeA('not valid key value data\n===broken===');
      expect(result.parseSuccessful).toBe(false);
    });
  });

  describe('Type B Parser (JSON)', () => {
    test('parses valid type B metadata', () => {
      const raw = '{"id":"DEV002","fw":"2.0.0","temp":"45.5","mode":"active"}';
      const result = parseTypeB(raw);

      expect(result.deviceId).toBe('DEV002');
      expect(result.firmwareVersion).toBe('2.0.0');
      expect(result.fields['temp']).toBe('45.5');
      expect(result.fields['mode']).toBe('active');
      expect(result.parseSuccessful).toBe(true);
    });

    test('handles malformed JSON', () => {
      const result = parseTypeB('{broken json');
      expect(result.parseSuccessful).toBe(false);
    });

    test('handles empty input', () => {
      const result = parseTypeB('');
      expect(result.parseSuccessful).toBe(false);
    });
  });

  describe('MetadataParserRegistry', () => {
    let registry: MetadataParserRegistry;

    beforeEach(() => {
      registry = new MetadataParserRegistry();
    });

    test('parses with registered type A parser', () => {
      const raw = 'device_id=DEV001\nfirmware_version=1.0.0';
      const result = registry.parse(raw, 'typeA');

      expect(result.deviceId).toBe('DEV001');
      expect(result.deviceType).toBe('typeA');
    });

    test('parses with registered type B parser', () => {
      const raw = '{"id":"DEV002","fw":"2.0.0"}';
      const result = registry.parse(raw, 'typeB');

      expect(result.deviceId).toBe('DEV002');
      expect(result.deviceType).toBe('typeB');
    });

    test('handles unknown device type', () => {
      const result = registry.parse('some data', 'unknownType');

      expect(result.parseSuccessful).toBe(false);
      expect(result.deviceType).toBe('unknownType');
    });

    test('registers custom parser', () => {
      registry.registerParser('typeC', (raw: string) => ({
        deviceId: raw.split(',')[0],
        deviceType: 'typeC',
        firmwareVersion: raw.split(',')[1] || '',
        fields: {},
        parseSuccessful: true,
      }));

      const result = registry.parse('DEV003,3.0.0', 'typeC');
      expect(result.deviceId).toBe('DEV003');
      expect(result.firmwareVersion).toBe('3.0.0');
    });

    test('lists registered types', () => {
      const types = registry.getRegisteredTypes();
      expect(types).toContain('typeA');
      expect(types).toContain('typeB');
    });
  });
});
