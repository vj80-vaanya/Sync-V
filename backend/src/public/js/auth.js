/* Sync-V Dashboard — JWT Auth Management */

const AUTH = {
  TOKEN_KEY: 'syncv_jwt',
  USER_KEY: 'syncv_user',

  getToken() { return localStorage.getItem(this.TOKEN_KEY); },
  setToken(token) { localStorage.setItem(this.TOKEN_KEY, token); },
  getUser() { try { return JSON.parse(localStorage.getItem(this.USER_KEY)); } catch { return null; } },
  setUser(user) { localStorage.setItem(this.USER_KEY, JSON.stringify(user)); },
  isLoggedIn() { return !!this.getToken(); },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.location.href = '/dashboard/';
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/dashboard/';
      return false;
    }
    return true;
  },

  login(token, user) {
    this.setToken(token);
    this.setUser(user);
    window.location.href = '/dashboard/overview.html';
  }
};
