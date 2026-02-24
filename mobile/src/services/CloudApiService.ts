import { CLOUD_CONFIG } from '../config';

export interface CloudAuthResult {
  success: boolean;
  error?: string;
}

export interface CloudUser {
  id: string;
  username: string;
  role: string;
}

type AuthChangeCallback = (loggedIn: boolean) => void;

export class CloudApiService {
  private baseUrl: string;
  private token: string | null = null;
  private user: CloudUser | null = null;
  private authListeners: Set<AuthChangeCallback> = new Set();

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || CLOUD_CONFIG.baseUrl;
  }

  // --- Auth ---

  async login(username: string, password: string): Promise<CloudAuthResult> {
    try {
      const resp = await fetch(`${this.baseUrl}${CLOUD_CONFIG.loginPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        return { success: false, error: body.error || `HTTP ${resp.status}` };
      }

      const data = await resp.json();
      this.token = data.token;
      this.user = data.user;
      this.notifyAuthListeners(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  logout(): void {
    this.token = null;
    this.user = null;
    this.notifyAuthListeners(false);
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  getUser(): CloudUser | null {
    return this.user;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  onAuthChange(callback: AuthChangeCallback): () => void {
    this.authListeners.add(callback);
    return () => { this.authListeners.delete(callback); };
  }

  // --- Health Check ---

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${this.baseUrl}${CLOUD_CONFIG.healthPath}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) return false;
      const data = await resp.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  // --- API Methods ---

  async get<T = any>(path: string): Promise<{ ok: boolean; data?: T; error?: string }> {
    return this.request<T>('GET', path);
  }

  async post<T = any>(path: string, body?: any): Promise<{ ok: boolean; data?: T; error?: string }> {
    return this.request<T>('POST', path, body);
  }

  async delete(path: string): Promise<{ ok: boolean; data?: any; error?: string }> {
    return this.request('DELETE', path);
  }

  // --- Internal ---

  private async request<T>(method: string, path: string, body?: any): Promise<{ ok: boolean; data?: T; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const config: RequestInit = { method, headers };
      if (body !== undefined) {
        config.body = JSON.stringify(body);
      }

      const resp = await fetch(`${this.baseUrl}${path}`, config);

      if (resp.status === 401) {
        this.token = null;
        this.user = null;
        this.notifyAuthListeners(false);
        return { ok: false, error: 'Session expired' };
      }

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        return { ok: false, error: data?.error || `HTTP ${resp.status}` };
      }

      return { ok: true, data: data as T };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Network error' };
    }
  }

  private notifyAuthListeners(loggedIn: boolean): void {
    for (const cb of this.authListeners) {
      try { cb(loggedIn); } catch { /* ignore */ }
    }
  }

  // --- Test helpers ---
  setToken(token: string): void {
    this.token = token;
  }
}
