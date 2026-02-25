import crypto from 'crypto';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { createDatabase } from './models/Database';

const DB_PATH = process.env.DB_PATH || ':memory:';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function seed(): Promise<void> {
  const db = createDatabase(DB_PATH);

  // Check idempotency — skip if platform admin already exists
  const existing = db.prepare("SELECT id FROM users WHERE role = 'platform_admin'").get();
  if (existing) {
    console.log('Demo data already seeded, skipping.');
    db.close();
    return;
  }

  const now = new Date().toISOString();

  // --- Platform Admin ---
  const platformAdminId = uuidv4();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(platformAdminId, 'platform-admin', await hashPassword('admin123'), 'platform_admin', now, now);

  // --- Organization ---
  const orgId = uuidv4();
  db.prepare(
    'INSERT INTO organizations (id, name, slug, plan, max_devices, max_storage_bytes, max_users, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(orgId, 'Acme Industries', 'acme', 'pro', 100, 10737418240, 25, 'active', now, now);

  // --- Org Admin ---
  const orgAdminId = uuidv4();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(orgAdminId, 'admin', await hashPassword('admin123'), 'org_admin', orgId, now, now);

  // --- Technician ---
  const techId = uuidv4();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(techId, 'tech1', await hashPassword('tech123'), 'technician', orgId, now, now);

  // --- Viewer ---
  const viewerId = uuidv4();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(viewerId, 'viewer1', await hashPassword('viewer123'), 'viewer', orgId, now, now);

  // --- Clusters ---
  const cluster1Id = uuidv4();
  const cluster2Id = uuidv4();
  db.prepare(
    'INSERT INTO clusters (id, org_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(cluster1Id, orgId, 'Pump Station Alpha', 'Primary pump station - Building A', now, now);
  db.prepare(
    'INSERT INTO clusters (id, org_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(cluster2Id, orgId, 'Motor Bay Bravo', 'Secondary motor bay - Building B', now, now);

  // --- Devices ---
  const devices = [
    { id: uuidv4(), name: 'PUMP-001', type: 'typeA', status: 'online', fw: '1.8.2', cluster: cluster1Id },
    { id: uuidv4(), name: 'PUMP-002', type: 'typeA', status: 'online', fw: '1.8.0', cluster: cluster1Id },
    { id: uuidv4(), name: 'MOTOR-001', type: 'typeB', status: 'online', fw: '1.4.1', cluster: cluster2Id },
    { id: uuidv4(), name: 'SENSOR-001', type: 'typeB', status: 'offline', fw: '1.3.0', cluster: cluster2Id },
  ];

  const insertDevice = db.prepare(
    'INSERT INTO devices (id, name, type, status, firmware_version, last_seen, metadata, org_id, cluster_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const d of devices) {
    const lastSeen = d.status === 'online' ? now : '2026-02-20T08:15:00.000Z';
    insertDevice.run(d.id, d.name, d.type, d.status, d.fw, lastSeen, '{}', orgId, d.cluster, now, now);
  }

  // --- Logs ---
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
    'INSERT INTO logs (id, device_id, filename, size, checksum, raw_path, raw_data, vendor, format, metadata, org_id, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
      orgId,
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
    'INSERT INTO firmware (id, version, device_type, filename, size, sha256, description, org_id, release_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const fw of firmwareEntries) {
    const fwHash = sha256(`${fw.filename}-${fw.version}-${fw.size}`);
    insertFirmware.run(uuidv4(), fw.version, fw.deviceType, fw.filename, fw.size, fwHash, fw.description, orgId, now, now);
  }

  // --- Second Organization (for isolation testing) ---
  const org2Id = uuidv4();
  db.prepare(
    'INSERT INTO organizations (id, name, slug, plan, max_devices, max_storage_bytes, max_users, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(org2Id, 'Beta Corp', 'beta-corp', 'free', 5, 104857600, 3, 'active', now, now);

  const org2AdminId = uuidv4();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(org2AdminId, 'beta-admin', await hashPassword('beta123'), 'org_admin', org2Id, now, now);

  // --- Webhook with anomaly.detected event ---
  db.prepare(
    'INSERT INTO webhooks (id, org_id, url, secret, events) VALUES (?, ?, ?, ?, ?)'
  ).run(uuidv4(), orgId, 'https://hooks.acme.example.com/syncv', 'whsec_acme_demo_secret', JSON.stringify(['anomaly.detected', 'log.uploaded']));

  // --- AI Demo Data: Anomalies ---
  const anomalyInsert = db.prepare(
    'INSERT INTO anomalies (id, device_id, org_id, type, severity, message, log_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  anomalyInsert.run(uuidv4(), devices[0].id, orgId, 'error_spike', 'high',
    'Error rate 33.3% is 5.2x the historical average of 6.4%', null,
    JSON.stringify({ errorRate: 0.333, avgErrorRate: 0.064, magnitude: 5.2 }));
  anomalyInsert.run(uuidv4(), devices[1].id, orgId, 'new_pattern', 'medium',
    '2 new error pattern(s) detected: pressure drop detected delta=-8.2psi', null,
    JSON.stringify({ newErrors: ['pressure drop detected delta=-8.2psi', 'recovery failed after 3 attempts'], count: 2 }));
  anomalyInsert.run(uuidv4(), devices[3].id, orgId, 'device_silent', 'high',
    'Device has not reported in 120h (expected every 24h)', null,
    JSON.stringify({ hoursOverdue: 120 }));

  // --- AI Demo Data: Health Scores ---
  const healthUpsert = db.prepare(`
    INSERT INTO device_health (device_id, score, factors, trend, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(device_id) DO UPDATE SET
      score = excluded.score, factors = excluded.factors,
      trend = excluded.trend, updated_at = excluded.updated_at
  `);
  const healthHistory = db.prepare(
    'INSERT INTO device_health_history (id, device_id, score) VALUES (?, ?, ?)'
  );
  const healthData = [
    { device: devices[0], score: 82, trend: 'stable', factors: { recency: 25, errorRate: 18, logFrequency: 20, firmwareCurrency: 8, anomalyCount: 10 } },
    { device: devices[1], score: 68, trend: 'degrading', factors: { recency: 25, errorRate: 12, logFrequency: 16, firmwareCurrency: 15, anomalyCount: 0 } },
    { device: devices[2], score: 91, trend: 'improving', factors: { recency: 25, errorRate: 22, logFrequency: 20, firmwareCurrency: 9, anomalyCount: 15 } },
    { device: devices[3], score: 35, trend: 'degrading', factors: { recency: 0, errorRate: 25, logFrequency: 0, firmwareCurrency: 0, anomalyCount: 10 } },
  ];
  for (const h of healthData) {
    healthUpsert.run(h.device.id, h.score, JSON.stringify(h.factors), h.trend);
    healthHistory.run(uuidv4(), h.device.id, h.score);
  }

  // --- AI Demo Data: Log Summaries (stored in log metadata) ---
  const allLogs = db.prepare('SELECT id, raw_data, metadata FROM logs WHERE org_id = ?').all(orgId) as any[];
  const updateMeta = db.prepare('UPDATE logs SET metadata = ? WHERE id = ?');
  for (const log of allLogs) {
    const lines = (log.raw_data || '').split('\n').filter((l: string) => l.trim());
    const errorCount = lines.filter((l: string) => /\b(ERROR|FATAL|CRITICAL|FAIL|exception|timeout)\b/i.test(l)).length;
    const warnCount = lines.filter((l: string) => /\b(WARN|WARNING)\b/i.test(l)).length;
    const lineCount = lines.length;
    const errorRate = lineCount > 0 ? Math.round((errorCount / lineCount) * 1000) / 1000 : 0;
    const summary = {
      lineCount, errorCount, warnCount, infoCount: lineCount - errorCount - warnCount,
      errorRate,
      topErrors: [] as string[], topWarnings: [] as string[], keywords: [] as string[],
      oneLiner: `${lineCount} lines${errorCount > 0 ? `, ${errorCount} errors (${(errorRate * 100).toFixed(1)}%)` : ''}${warnCount > 0 ? `, ${warnCount} warnings` : ''}${errorCount === 0 && warnCount === 0 ? '. No errors or warnings detected' : ''}`,
    };
    let meta: any = {};
    try { meta = JSON.parse(log.metadata || '{}'); } catch {}
    meta.ai_summary = summary;
    updateMeta.run(JSON.stringify(meta), log.id);
  }

  console.log('Demo data seeded:');
  console.log('  Platform admin: platform-admin/admin123');
  console.log('  Org "Acme Industries" (pro plan):');
  console.log('    Org admin: admin/admin123');
  console.log('    Technician: tech1/tech123');
  console.log('    Viewer: viewer1/viewer123');
  console.log('    4 devices, 8 logs, 2 firmware, 2 clusters');
  console.log('    3 anomalies, 4 health scores, 8 log summaries, 1 webhook');
  console.log('  Org "Beta Corp" (free plan):');
  console.log('    Org admin: beta-admin/beta123');
  db.close();
}

seed();
