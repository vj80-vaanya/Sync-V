export const CLOUD_CONFIG = {
  baseUrl: 'https://syncv-cloud-production.up.railway.app',
  healthPath: '/health',
  loginPath: '/api/auth/login',
  logsPath: '/api/logs',
  firmwarePath: '/api/firmware',
  devicesPath: '/api/devices',
  monitorIntervalMs: 15000, // check cloud every 15s
};
