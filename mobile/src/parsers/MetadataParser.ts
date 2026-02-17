import { DeviceMetadata } from '../types/Device';

type ParserFunction = (raw: string) => DeviceMetadata;

export function parseTypeA(raw: string): DeviceMetadata {
  const result: DeviceMetadata = {
    deviceId: '',
    deviceType: 'typeA',
    firmwareVersion: '',
    fields: {},
    parseSuccessful: false,
  };

  if (!raw || raw.trim().length === 0) {
    return result;
  }

  const lines = raw.split('\n');
  let foundAnyValid = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();

    if (key === 'device_id') {
      result.deviceId = value;
    } else if (key === 'firmware_version') {
      result.firmwareVersion = value;
    } else {
      result.fields[key] = value;
    }
    foundAnyValid = true;
  }

  result.parseSuccessful = foundAnyValid && result.deviceId.length > 0;
  return result;
}

export function parseTypeB(raw: string): DeviceMetadata {
  const result: DeviceMetadata = {
    deviceId: '',
    deviceType: 'typeB',
    firmwareVersion: '',
    fields: {},
    parseSuccessful: false,
  };

  if (!raw || raw.trim().length === 0) {
    return result;
  }

  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) {
      return result;
    }

    for (const [key, value] of Object.entries(obj)) {
      const strValue = String(value);
      if (key === 'id') {
        result.deviceId = strValue;
      } else if (key === 'fw') {
        result.firmwareVersion = strValue;
      } else {
        result.fields[key] = strValue;
      }
    }

    result.parseSuccessful = result.deviceId.length > 0;
  } catch {
    result.parseSuccessful = false;
  }

  return result;
}

export class MetadataParserRegistry {
  private parsers: Map<string, ParserFunction> = new Map();

  constructor() {
    this.parsers.set('typeA', parseTypeA);
    this.parsers.set('typeB', parseTypeB);
  }

  parse(raw: string, deviceType: string): DeviceMetadata {
    const parser = this.parsers.get(deviceType);
    if (!parser) {
      return {
        deviceId: '',
        deviceType,
        firmwareVersion: '',
        fields: {},
        parseSuccessful: false,
      };
    }

    const result = parser(raw);
    result.deviceType = deviceType;
    return result;
  }

  registerParser(deviceType: string, parser: ParserFunction): void {
    this.parsers.set(deviceType, parser);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.parsers.keys());
  }
}
