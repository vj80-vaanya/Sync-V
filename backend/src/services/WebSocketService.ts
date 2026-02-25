import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends WebSocket {
  orgId?: string;
  userId?: string;
  isAlive?: boolean;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private connections = new Map<string, Set<AuthenticatedSocket>>(); // orgId -> connections
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private jwtSecret: string;

  constructor(server: HttpServer, jwtSecret: string) {
    this.jwtSecret = jwtSecret;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: AuthenticatedSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const sock = ws as AuthenticatedSocket;
        if (sock.isAlive === false) {
          this.removeConnection(sock);
          return sock.terminate();
        }
        sock.isAlive = false;
        sock.ping();
      });
    }, 30000);
  }

  private handleConnection(ws: AuthenticatedSocket, req: any): void {
    // Parse token from query string
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Missing token');
        return;
      }

      const payload = jwt.verify(token, this.jwtSecret) as any;
      if (!payload.orgId) {
        ws.close(4003, 'No org context');
        return;
      }

      ws.orgId = payload.orgId;
      ws.userId = payload.userId;
      ws.isAlive = true;

      // Register connection
      const orgId = ws.orgId!;
      if (!this.connections.has(orgId)) {
        this.connections.set(orgId, new Set());
      }
      this.connections.get(orgId)!.add(ws);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('close', () => {
        this.removeConnection(ws);
      });

      ws.send(JSON.stringify({ type: 'connected', orgId: ws.orgId }));
    } catch {
      ws.close(4002, 'Invalid token');
    }
  }

  private removeConnection(ws: AuthenticatedSocket): void {
    if (ws.orgId && this.connections.has(ws.orgId)) {
      this.connections.get(ws.orgId)!.delete(ws);
      if (this.connections.get(ws.orgId)!.size === 0) {
        this.connections.delete(ws.orgId);
      }
    }
  }

  broadcastAnomaly(orgId: string, anomaly: any): void {
    this.broadcast(orgId, { type: 'anomaly.detected', data: anomaly });
  }

  broadcastHealthUpdate(orgId: string, results: any[]): void {
    this.broadcast(orgId, { type: 'health.updated', data: results });
  }

  private broadcast(orgId: string, message: any): void {
    const sockets = this.connections.get(orgId);
    if (!sockets) return;

    const payload = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.wss.close();
  }

  getConnectionCount(orgId?: string): number {
    if (orgId) {
      return this.connections.get(orgId)?.size || 0;
    }
    let total = 0;
    for (const sockets of this.connections.values()) {
      total += sockets.size;
    }
    return total;
  }
}
