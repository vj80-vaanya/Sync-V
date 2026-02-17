/* Sync-V Dashboard — Shared Utilities */

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
  next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
};

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
    '<div class="nav-brand">Sync-V</div>' +
    '<button class="nav-hamburger" onclick="toggleMobileNav()" aria-label="Menu">' + ICONS.hamburger + '</button>' +
    '<div class="nav-links" id="nav-links">' + linksHtml + '</div>' +
    '<div class="nav-user">' +
      '<span>' + userName + '</span>' +
      '<span class="role">' + userRole + '</span>' +
      '<button class="logout-btn" onclick="AUTH.logout()">' + ICONS.logout + ' Logout</button>' +
    '</div>';
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
    '<span class="toast-message">' + escapeHtml(message) + '</span>';

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
