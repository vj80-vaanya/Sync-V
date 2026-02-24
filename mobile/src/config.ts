export const DRIVE_CONFIG = {
  ssidPrefix: 'SyncV',
  defaultAddress: '192.168.4.1',
  defaultPort: 8080,
  healthPath: '/health',
  filesPath: '/files',
  firmwarePath: '/firmware',
  authToken: '',
  pingIntervalMs: 5000,
  pingTimeoutMs: 3000,
};

export const CLOUD_CONFIG = {
  baseUrl: 'https://syncv-cloud-production.up.railway.app',
  healthPath: '/health',
  loginPath: '/api/auth/login',
  logsPath: '/api/logs',
  firmwarePath: '/api/firmware',
  devicesPath: '/api/devices',
  monitorIntervalMs: 15000, // check cloud every 15s
};
