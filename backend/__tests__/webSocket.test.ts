import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { WebSocketService } from '../src/services/WebSocketService';
import WebSocket from 'ws';

const JWT_SECRET = 'test-ws-secret';

describe('WebSocketService', () => {
  let server: http.Server;
  let wsService: WebSocketService;
  let port: number;

  beforeAll((done) => {
    const app = express();
    server = http.createServer(app);
    wsService = new WebSocketService(server, JWT_SECRET);
    server.listen(0, () => {
      port = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    wsService.close();
    server.close(done);
  });

  function createToken(orgId: string, userId: string = 'user-1'): string {
    return jwt.sign({ orgId, userId, username: 'test', role: 'org_admin' }, JWT_SECRET, { expiresIn: '1h' });
  }

  test('rejects connection without token', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on('close', (code) => {
      expect(code).toBe(4001);
      done();
    });
    ws.on('error', () => { /* expected */ });
  });

  test('rejects connection with invalid token', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=invalid`);
    ws.on('close', (code) => {
      expect(code).toBe(4002);
      done();
    });
    ws.on('error', () => { /* expected */ });
  });

  test('accepts valid connection and sends connected message', (done) => {
    const token = createToken('org-ws-1');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg.type).toBe('connected');
      expect(msg.orgId).toBe('org-ws-1');
      ws.close();
      done();
    });
  });

  test('broadcastAnomaly sends to connected clients of the same org', (done) => {
    const token = createToken('org-ws-2');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    let messageCount = 0;

    ws.on('message', (data) => {
      messageCount++;
      const msg = JSON.parse(data.toString());
      if (messageCount === 1) {
        // First message is 'connected'
        expect(msg.type).toBe('connected');
        // Now broadcast anomaly
        wsService.broadcastAnomaly('org-ws-2', { id: 'anom-1', type: 'error_spike' });
      } else if (messageCount === 2) {
        expect(msg.type).toBe('anomaly.detected');
        expect(msg.data.id).toBe('anom-1');
        ws.close();
        done();
      }
    });
  });

  test('broadcastHealthUpdate sends to connected clients', (done) => {
    const token = createToken('org-ws-3');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    let messageCount = 0;

    ws.on('message', (data) => {
      messageCount++;
      const msg = JSON.parse(data.toString());
      if (messageCount === 1) {
        wsService.broadcastHealthUpdate('org-ws-3', [{ deviceId: 'dev-1', score: 85 }]);
      } else if (messageCount === 2) {
        expect(msg.type).toBe('health.updated');
        expect(msg.data[0].score).toBe(85);
        ws.close();
        done();
      }
    });
  });

  test('does not broadcast to clients of different org', (done) => {
    const token = createToken('org-ws-4');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    let receivedBroadcast = false;

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        // Broadcast to a DIFFERENT org
        wsService.broadcastAnomaly('other-org', { id: 'anom-other' });
        // Wait a bit then verify we didn't get the broadcast
        setTimeout(() => {
          expect(receivedBroadcast).toBe(false);
          ws.close();
          done();
        }, 100);
      } else if (msg.type === 'anomaly.detected') {
        receivedBroadcast = true;
      }
    });
  });

  test('getConnectionCount returns correct counts', (done) => {
    const token = createToken('org-ws-5');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);

    ws.on('message', () => {
      expect(wsService.getConnectionCount('org-ws-5')).toBe(1);
      expect(wsService.getConnectionCount()).toBeGreaterThanOrEqual(1);
      ws.close();
      setTimeout(done, 50);
    });
  });
});
