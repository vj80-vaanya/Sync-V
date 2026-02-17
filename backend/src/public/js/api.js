/* Sync-V Dashboard — API Fetch Wrapper */

async function api(path, options) {
  const token = AUTH.getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const config = Object.assign({}, options || {}, { headers: headers });

  let response;
  try {
    response = await fetch(path, config);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Network error — check your connection', 'error');
    return null;
  }

  if (response.status === 401) {
    if (typeof showToast === 'function') showToast('Session expired — please log in again', 'warning');
    setTimeout(function() { AUTH.logout(); }, 1500);
    return null;
  }

  if (response.status >= 500) {
    if (typeof showToast === 'function') showToast('Server error — please try again', 'error');
  }

  if (response.status === 204) return null;

  return response.json();
}

async function apiGet(path) {
  return api(path);
}

async function apiPost(path, body) {
  return api(path, { method: 'POST', body: JSON.stringify(body) });
}

async function apiPatch(path, body) {
  return api(path, { method: 'PATCH', body: JSON.stringify(body) });
}
