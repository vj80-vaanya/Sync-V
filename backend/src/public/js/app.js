/* Sync-V Dashboard — Shared Utilities */

/* --- Brand Logo SVG (circuit-sync themed "S") --- */
var BRAND_LOGO = '<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<defs><linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">' +
  '<stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#4f46e5"/>' +
  '</linearGradient></defs>' +
  '<rect width="40" height="40" rx="10" fill="url(#logoGrad)"/>' +
  '<path d="M12 16.5C12 13.5 14.5 11 17.5 11H22C22 11 20 14 17.5 14C15.5 14 15 15.2 15 16.5C15 17.8 16 18.5 17.5 19L22.5 21C25 22 26 23.8 26 26C26 29 23.5 31 20.5 31H16" stroke="white" stroke-width="2.2" stroke-linecap="round"/>' +
  '<circle cx="10" cy="11" r="2" fill="rgba(255,255,255,0.5)"/>' +
  '<circle cx="30" cy="31" r="2" fill="rgba(255,255,255,0.5)"/>' +
  '<line x1="12" y1="11" x2="14.5" y2="11" stroke="rgba(255,255,255,0.4)" stroke-width="1.2"/>' +
  '<line x1="25.5" y1="31" x2="28" y2="31" stroke="rgba(255,255,255,0.4)" stroke-width="1.2"/>' +
  '<path d="M28 11L32 11L32 15" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-linecap="round"/>' +
  '<path d="M12 31L8 31L8 27" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-linecap="round"/>' +
  '</svg>';

/* --- Theme System --- */
var ICONS_THEME = {
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};

function initTheme() {
  var saved = localStorage.getItem('syncv-theme');
  var theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('syncv-theme', next);
  updateThemeButtons(next);
}

function updateThemeButtons(theme) {
  var btns = document.querySelectorAll('.theme-toggle');
  btns.forEach(function(btn) {
    var icon = theme === 'dark' ? ICONS_THEME.sun : ICONS_THEME.moon;
    var label = theme === 'dark' ? 'Light' : 'Dark';
    btn.innerHTML = icon + ' ' + label;
  });
}

// Apply theme immediately (before DOM renders)
initTheme();

/* --- Inline SVG Icon Map (Lucide-style, 18x18 stroke icons) --- */
var ICONS = {
  overview: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  devices: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>',
  logs: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  firmware: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  online: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  offline: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  hamburger: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  upload: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  package: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  emptyBox: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  totalDevices: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>',
  logsTotal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  checkmark: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  exportCsv: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>'
};

/* --- Download Helpers --- */
function downloadFile(content, filename, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadLogAsJson(logIndex) {
  if (typeof window._currentLogs === 'undefined') return;
  var log = window._currentLogs[logIndex];
  if (!log) return;
  var json = JSON.stringify(log, null, 2);
  downloadFile(json, log.filename.replace(/\.[^.]+$/, '') + '.json', 'application/json');
}

function exportLogsAsCsv(logs) {
  if (!logs || !logs.length) return;
  var headers = ['Log ID', 'Device ID', 'Filename', 'Size (bytes)', 'Checksum', 'Uploaded At'];
  var rows = logs.map(function(l) {
    return [l.id, l.device_id, l.filename, l.size, l.checksum, l.uploaded_at].map(function(v) {
      var s = String(v || '');
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',');
  });
  var csv = headers.join(',') + '\n' + rows.join('\n');
  downloadFile(csv, 'syncv-logs-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
}

/* --- NavBar with Icons & Hamburger --- */
function renderNavBar(activePage) {
  var user = AUTH.getUser();
  var nav = document.getElementById('nav-bar');
  if (!nav) return;

  var pages = [
    { id: 'overview', label: 'Overview', href: '/dashboard/overview.html', icon: ICONS.overview },
    { id: 'devices', label: 'Devices', href: '/dashboard/devices.html', icon: ICONS.devices },
    { id: 'logs', label: 'Logs', href: '/dashboard/logs.html', icon: ICONS.logs },
    { id: 'firmware', label: 'Firmware', href: '/dashboard/firmware.html', icon: ICONS.firmware }
  ];

  var linksHtml = pages.map(function(p) {
    var cls = p.id === activePage ? ' class="active"' : '';
    return '<a href="' + p.href + '"' + cls + '>' + p.icon + ' ' + p.label + '</a>';
  }).join('');

  var userName = user ? user.username : '';
  var userRole = user ? user.role : '';

  nav.className = 'nav-bar';
  nav.innerHTML =
    '<div class="nav-brand"><span class="logo-icon logo-icon-nav">' + BRAND_LOGO + '</span><span class="nav-brand-gradient">Sync-V</span></div>' +
    '<button class="nav-hamburger" onclick="toggleMobileNav()" aria-label="Menu">' + ICONS.hamburger + '</button>' +
    '<div class="nav-links" id="nav-links">' + linksHtml + '</div>' +
    '<div class="nav-user">' +
      '<button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme"></button>' +
      '<span>' + userName + '</span>' +
      '<span class="role">' + userRole + '</span>' +
      '<button class="logout-btn" onclick="AUTH.logout()">' + ICONS.logout + ' Logout</button>' +
    '</div>';

  var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeButtons(currentTheme);
}

function toggleMobileNav() {
  var links = document.getElementById('nav-links');
  if (links) links.classList.toggle('open');
}

/* --- Toast System --- */
function ensureToastContainer() {
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type) {
  type = type || 'success';
  var container = ensureToastContainer();

  var iconMap = { success: ICONS.success, error: ICONS.error, warning: ICONS.warning };
  var icon = iconMap[type] || iconMap.success;

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<span class="toast-icon">' + icon + '</span>' +
    '<span class="toast-message">' + escapeHtml(message) + '</span>' +
    '<span class="toast-progress"></span>';

  container.appendChild(toast);

  setTimeout(function() {
    toast.classList.add('toast-removing');
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
}

/* --- Skeleton Helpers --- */
function skeletonRows(count, cols) {
  var rows = '';
  for (var i = 0; i < count; i++) {
    var cells = '';
    for (var j = 0; j < cols; j++) {
      var w = (j === 0) ? '70%' : (j === cols - 1) ? '50%' : '80%';
      cells += '<td><div class="skeleton skeleton-text" style="width:' + w + '"></div></td>';
    }
    rows += '<tr>' + cells + '</tr>';
  }
  return rows;
}

function skeletonCards(count) {
  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<div class="stat-card"><div class="skeleton skeleton-card" style="height:80px"></div></div>';
  }
  return html;
}

/* --- Table Sort Engine --- */
function makeSortable(tableId, dataArray, renderFn, columns) {
  var table = document.getElementById(tableId);
  if (!table) return;

  var thead = table.closest('table').querySelector('thead');
  if (!thead) return;
  var ths = thead.querySelectorAll('th');

  var sortCol = -1;
  var sortDir = 'asc';

  ths.forEach(function(th, idx) {
    if (columns[idx]) {
      th.classList.add('sortable');
      th.addEventListener('click', function() {
        if (sortCol === idx) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortCol = idx;
          sortDir = 'asc';
        }

        ths.forEach(function(h) { h.classList.remove('asc', 'desc'); });
        th.classList.add(sortDir);

        var colDef = columns[idx];
        var sorted = dataArray.slice().sort(function(a, b) {
          var av = colDef.key(a);
          var bv = colDef.key(b);

          if (colDef.type === 'number') {
            av = Number(av) || 0;
            bv = Number(bv) || 0;
            return sortDir === 'asc' ? av - bv : bv - av;
          }
          if (colDef.type === 'date') {
            av = new Date(av || 0).getTime();
            bv = new Date(bv || 0).getTime();
            return sortDir === 'asc' ? av - bv : bv - av;
          }
          // string
          av = String(av || '').toLowerCase();
          bv = String(bv || '').toLowerCase();
          if (av < bv) return sortDir === 'asc' ? -1 : 1;
          if (av > bv) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });

        renderFn(sorted);
      });
    }
  });
}

/* --- Utility Functions --- */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function vendorBadge(vendor) {
  if (!vendor || vendor === 'unknown') return '<span class="badge badge-muted">unknown</span>';
  return '<span class="badge badge-info">' + escapeHtml(vendor) + '</span>';
}

function formatBadge(fmt) {
  var colorMap = {
    text: 'muted',
    json: 'success',
    csv: 'info',
    syslog: 'warning',
    xml: 'danger',
    binary: 'muted'
  };
  var cls = colorMap[fmt] || 'muted';
  return '<span class="badge badge-' + cls + '">' + escapeHtml(fmt || 'text') + '</span>';
}

function downloadLogRaw(logId, filename) {
  var token = AUTH.getToken();
  var url = '/api/logs/' + encodeURIComponent(logId) + '/raw';
  fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Download failed');
      return resp.blob();
    })
    .then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'log-download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    })
    .catch(function(err) { showToast('Download failed: ' + err.message, 'error'); });
}

function statusBadge(status) {
  var map = {
    online: 'success',
    offline: 'danger',
    unknown: 'muted'
  };
  var cls = map[status] || 'muted';
  return '<span class="badge badge-' + cls + '"><span class="badge-dot"></span>' + status + '</span>';
}

function truncate(str, len) {
  if (!str) return '-';
  if (str.length <= len) return str;
  return str.substring(0, len) + '...';
}

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* --- Stagger Animation Helpers --- */
function staggerCards(containerSelector) {
  var container = document.querySelector(containerSelector);
  if (!container) return;
  var cards = container.children;
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.add('stagger-item');
    cards[i].style.animationDelay = (i * 0.07) + 's';
  }
}

function staggerRows(tbodyId) {
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  var rows = tbody.querySelectorAll('tr');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.add('stagger-item');
    rows[i].style.animationDelay = (i * 0.04) + 's';
  }
}

/* --- Footer --- */
function renderFooter() {
  var footer = document.createElement('footer');
  footer.className = 'dashboard-footer';
  footer.innerHTML =
    '<span class="footer-logo" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:4px">' + BRAND_LOGO + '</span>' +
    'Sync-V &mdash; Powered by <span class="footer-brand">Sinnov8</span>';
  document.body.appendChild(footer);
}

/* --- Animated Counter --- */
function animateCounter(element, target, duration) {
  duration = duration || 1200;
  var start = 0;
  var startTime = null;

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.round(eased * target);
    element.textContent = current;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = target;
    }
  }

  element.textContent = '0';
  element.classList.add('counter-animate');
  requestAnimationFrame(step);
}
