import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createDatabase } from './models/Database';

const DB_PATH = process.env.DB_PATH || ':memory:';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function seed(): void {
  const db = createDatabase(DB_PATH);

  // Check idempotency — skip if admin already exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existing) {
    console.log('Demo data already seeded, skipping.');
    db.close();
    return;
  }

  const now = new Date().toISOString();

  // --- Admin user ---
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uuidv4(), 'admin', hashPassword('admin123'), 'admin', now);

  // --- Devices ---
  const devices = [
    { id: uuidv4(), name: 'PUMP-001', type: 'typeA', status: 'online', fw: '1.8.2' },
    { id: uuidv4(), name: 'PUMP-002', type: 'typeA', status: 'online', fw: '1.8.0' },
    { id: uuidv4(), name: 'MOTOR-001', type: 'typeB', status: 'online', fw: '1.4.1' },
    { id: uuidv4(), name: 'SENSOR-001', type: 'typeB', status: 'offline', fw: '1.3.0' },
  ];

  const insertDevice = db.prepare(
    'INSERT INTO devices (id, name, type, status, firmware_version, last_seen, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const d of devices) {
    const lastSeen = d.status === 'online' ? now : '2026-02-20T08:15:00.000Z';
    insertDevice.run(d.id, d.name, d.type, d.status, d.fw, lastSeen, '{}', now, now);
  }

  // --- Logs with diverse vendors, formats, and actual content ---
  const logEntries = [
    {
      deviceIdx: 0, filename: 'pump001-pressure-20260223.log',
      vendor: 'Siemens', format: 'text',
      content: 'pressure=42.5psi temp=65.2F flow=128.3gpm ts=1708700000\npressure=42.8psi temp=65.4F flow=128.1gpm ts=1708700060\npressure=43.0psi temp=65.3F flow=128.5gpm ts=1708700120',
    },
    {
      deviceIdx: 0, filename: 'pump001-vibration-20260222.json',
      vendor: 'Siemens', format: 'json',
      content: JSON.stringify({ readings: [{ vibration_x: 0.02, vibration_y: 0.01, rpm: 1450, ts: 1708600000 }, { vibration_x: 0.03, vibration_y: 0.01, rpm: 1455, ts: 1708600060 }], unit: "mm", device: "PUMP-001" }, null, 2),
    },
    {
      deviceIdx: 1, filename: 'pump002-pressure-20260223.csv',
      vendor: 'ABB', format: 'csv',
      content: 'timestamp,pressure_psi,temp_f,flow_gpm\n1708700100,39.8,62.1,115.7\n1708700160,40.1,62.3,116.0\n1708700220,39.5,62.0,115.2',
    },
    {
      deviceIdx: 1, filename: 'pump002-alert-20260221.log',
      vendor: 'ABB', format: 'syslog',
      content: '<14>Feb 21 10:15:00 PUMP-002 pressure-monitor[1234]: WARN pressure drop detected delta=-8.2psi duration=45s\n<11>Feb 21 10:15:45 PUMP-002 pressure-monitor[1234]: ERR recovery failed after 3 attempts\n<14>Feb 21 10:16:30 PUMP-002 pressure-monitor[1234]: INFO manual override engaged',
    },
    {
      deviceIdx: 2, filename: 'motor001-current-20260223.xml',
      vendor: 'Schneider', format: 'xml',
      content: '<?xml version="1.0" encoding="UTF-8"?>\n<readings device="MOTOR-001" vendor="Schneider">\n  <reading ts="1708700200">\n    <phase_a unit="A">12.4</phase_a>\n    <phase_b unit="A">12.3</phase_b>\n    <phase_c unit="A">12.5</phase_c>\n    <rpm>3600</rpm>\n  </reading>\n</readings>',
    },
    {
      deviceIdx: 2, filename: 'motor001-thermal-20260222.json',
      vendor: 'Schneider', format: 'json',
      content: JSON.stringify({ bearing_temp: 78.5, winding_temp: 92.1, ambient: 24.3, ts: 1708600100, alerts: [] }, null, 2),
    },
    {
      deviceIdx: 3, filename: 'sensor001-reading-20260220.csv',
      vendor: 'Honeywell', format: 'csv',
      content: 'timestamp,level_m,conductivity_uS,humidity_pct\n1708400000,2.34,450,68.2\n1708400060,2.35,451,68.1\n1708400120,2.33,449,68.3',
    },
    {
      deviceIdx: 3, filename: 'sensor001-calib-20260219.log',
      vendor: 'Honeywell', format: 'text',
      content: 'calibration offset=0.003 gain=1.002 status=OK ts=1708300000\nzero-point check: PASS\nspan check: PASS\nnext calibration due: 2026-08-19',
    },
  ];

  const insertLog = db.prepare(
    'INSERT INTO logs (id, device_id, filename, size, checksum, raw_path, raw_data, vendor, format, metadata, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const entry of logEntries) {
    const checksum = sha256(entry.content);
    insertLog.run(
      uuidv4(),
      devices[entry.deviceIdx].id,
      entry.filename,
      entry.content.length,
      checksum,
      '',
      entry.content,
      entry.vendor,
      entry.format,
      '{}',
      now
    );
  }

  // --- Firmware packages ---
  const firmwareEntries = [
    {
      version: '2.0.0',
      deviceType: 'typeA',
      filename: 'typeA-v2.0.0.bin',
      size: 524288,
      description: 'Major update: improved pressure regulation algorithm, reduced power consumption by 15%',
    },
    {
      version: '1.5.0',
      deviceType: 'typeB',
      filename: 'typeB-v1.5.0.bin',
      size: 262144,
      description: 'Thermal monitoring enhancements, new calibration routine',
    },
  ];

  const insertFirmware = db.prepare(
    'INSERT INTO firmware (id, version, device_type, filename, size, sha256, description, release_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const fw of firmwareEntries) {
    const fwHash = sha256(`${fw.filename}-${fw.version}-${fw.size}`);
    insertFirmware.run(uuidv4(), fw.version, fw.deviceType, fw.filename, fw.size, fwHash, fw.description, now, now);
  }

  console.log('Demo data seeded: 1 admin user, 4 devices, 8 logs (4 vendors, 5 formats), 2 firmware packages.');
  db.close();
}

seed();
