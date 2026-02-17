/**
 * DeviceSimulator — Simulates a real industrial device for E2E testing.
 *
 * Models a physical device that:
 * - Produces sensor logs at intervals
 * - Has firmware that can be updated
 * - Goes online/offline
 * - Reports metadata in a specific format (typeA or typeB)
 */

import { createHash } from '../../mobile/src/utils/hash';

export interface SimulatedLog {
  filename: string;
  content: string;
  size: number;
  checksum: string;
  timestamp: string;
}

export interface DeviceState {
  id: string;
  name: string;
  type: string;
  firmwareVersion: string;
  status: 'online' | 'offline';
  logs: SimulatedLog[];
  metadata: Record<string, string>;
}

export class DeviceSimulator {
  private state: DeviceState;
  private logCounter: number = 0;

  constructor(config: {
    id: string;
    name: string;
    type: string;
    firmwareVersion?: string;
    metadata?: Record<string, string>;
  }) {
    this.state = {
      id: config.id,
      name: config.name,
      type: config.type,
      firmwareVersion: config.firmwareVersion || '1.0.0',
      status: 'online',
      logs: [],
      metadata: config.metadata || {},
    };
  }

  /** Generate a sensor reading log */
  produceSensorLog(sensorData: Record<string, number>): SimulatedLog {
    this.logCounter++;
    const timestamp = new Date().toISOString();
    const lines = Object.entries(sensorData)
      .map(([key, val]) => `${key}=${val}`)
      .join('\n');
    const content = `device_id=${this.state.id}\ntimestamp=${timestamp}\n${lines}`;
    const checksum = createHash(content);
    const filename = `${this.state.id}_sensor_${this.logCounter}.log`;

    const log: SimulatedLog = {
      filename,
      content,
      size: content.length,
      checksum,
      timestamp,
    };

    this.state.logs.push(log);
    return log;
  }

  /** Generate an error event log */
  produceErrorLog(errorCode: string, message: string): SimulatedLog {
    this.logCounter++;
    const timestamp = new Date().toISOString();
    const content = `device_id=${this.state.id}\ntimestamp=${timestamp}\nerror_code=${errorCode}\nmessage=${message}`;
    const checksum = createHash(content);
    const filename = `${this.state.id}_error_${this.logCounter}.log`;

    const log: SimulatedLog = {
      filename,
      content,
      size: content.length,
      checksum,
      timestamp,
    };

    this.state.logs.push(log);
    return log;
  }

  /** Get all unsent logs */
  getPendingLogs(): SimulatedLog[] {
    return [...this.state.logs];
  }

  /** Clear logs after they've been collected by the drive */
  clearCollectedLogs(): void {
    this.state.logs = [];
  }

  /** Simulate device going offline */
  goOffline(): void {
    this.state.status = 'offline';
  }

  /** Simulate device coming back online */
  goOnline(): void {
    this.state.status = 'online';
  }

  /** Apply firmware update */
  applyFirmwareUpdate(version: string, firmwareData: string, expectedHash: string): boolean {
    const actualHash = createHash(firmwareData);
    if (actualHash !== expectedHash) {
      return false; // Integrity check failed
    }
    this.state.firmwareVersion = version;
    return true;
  }

  /** Get metadata in typeA format (key=value) */
  getMetadataTypeA(): string {
    const lines = [
      `device_id=${this.state.id}`,
      `firmware_version=${this.state.firmwareVersion}`,
      ...Object.entries(this.state.metadata).map(([k, v]) => `${k}=${v}`),
    ];
    return lines.join('\n');
  }

  /** Get metadata in typeB format (JSON) */
  getMetadataTypeB(): string {
    return JSON.stringify({
      id: this.state.id,
      fw: this.state.firmwareVersion,
      ...this.state.metadata,
    });
  }

  getState(): DeviceState {
    return { ...this.state, logs: [...this.state.logs] };
  }

  getId(): string {
    return this.state.id;
  }

  getFirmwareVersion(): string {
    return this.state.firmwareVersion;
  }

  getStatus(): string {
    return this.state.status;
  }
}

/**
 * FleetSimulator — Manages multiple DeviceSimulators as a fleet.
 */
export class FleetSimulator {
  private devices: Map<string, DeviceSimulator> = new Map();

  addDevice(simulator: DeviceSimulator): void {
    this.devices.set(simulator.getId(), simulator);
  }

  getDevice(id: string): DeviceSimulator | undefined {
    return this.devices.get(id);
  }

  getAllDevices(): DeviceSimulator[] {
    return Array.from(this.devices.values());
  }

  getOnlineDevices(): DeviceSimulator[] {
    return this.getAllDevices().filter(d => d.getStatus() === 'online');
  }

  getOfflineDevices(): DeviceSimulator[] {
    return this.getAllDevices().filter(d => d.getStatus() === 'offline');
  }

  /** Simulate all devices producing sensor readings */
  produceFleetSensorData(sensorData: Record<string, number>): SimulatedLog[] {
    const logs: SimulatedLog[] = [];
    for (const device of this.getOnlineDevices()) {
      logs.push(device.produceSensorLog(sensorData));
    }
    return logs;
  }

  /** Get all pending logs across the fleet */
  getAllPendingLogs(): { deviceId: string; logs: SimulatedLog[] }[] {
    return this.getAllDevices()
      .filter(d => d.getPendingLogs().length > 0)
      .map(d => ({
        deviceId: d.getId(),
        logs: d.getPendingLogs(),
      }));
  }
}
