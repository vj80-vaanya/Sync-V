/* Sync-V Dashboard — Auth Management (httpOnly cookie-based) */

const AUTH = {
  USER_KEY: 'syncv_user',

  getUser() { try { return JSON.parse(localStorage.getItem(this.USER_KEY)); } catch { return null; } },
  setUser(user) { localStorage.setItem(this.USER_KEY, JSON.stringify(user)); },
  isLoggedIn() { return !!this.getUser(); },

  async logout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
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
    // Cookie is already set by server response (httpOnly)
    this.setUser(user);
    window.location.href = '/dashboard/overview.html';
  }
};
