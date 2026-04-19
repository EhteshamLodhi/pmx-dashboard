// layout.js - Generates global layout, Desktop Header & Mobile Bottom Nav dynamically

// Map to handle SVG icons simply
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>',
  tracker: '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
  Tasks: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
};

const MENU = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard/index.html', icon: 'dashboard', roles: ['admin', 'manager'] }, // Add engineer if Dashboard is for everyone
  { id: 'tracker', label: 'Tracker', path: '/tracker/index.html', icon: 'tracker', roles: ['admin', 'manager', 'engineer'] },
  { id: 'users', label: 'Users', path: '/admin/users.html', icon: 'users', roles: ['admin'] },
  { id: 'tasks', label: 'Tasks', path: '/tasks/index.html', icon: 'tasks', roles: ['admin'] }
];

function generateLayout() {
  if (!window.portalState || !window.portalState.isLoaded) return;
  const profile = window.portalState.Profile;
  const currentPath = window.location.pathname;

  // Render logic based on roles
  const visibleMenu = MENU.filter(m => m.roles.includes(profile.role));

  // --- Header Construction ---
  let headerHtml = `
    <a href="/dashboard/index.html" class="logo-area">
      <div class="logo-mark">PM</div>
      <div class="logo-text">Power<em>matix</em></div>
    </a>
    <div class="nav-links">
      ${visibleMenu.map(m => `
        <a href="${m.path}" class="nav-link ${currentPath.includes(m.path) ? 'active' : ''}">
          ${m.label}
        </a>
      `).join('')}
    </div>
    <div class="user-area">
      <div class="user-info-text">
        <span class="user-name">${profile.full_name || 'User'}</span>
        <span class="user-role">${profile.role}</span>
      </div>
      <div class="avatar">${(profile.full_name || 'U')[0].toUpperCase()}</div>
      <button class="btn-logout" onclick="window.db.auth.signOut().then(() => window.location.href='/index.html')">Logout</button>
    </div>
  `;
  const headerEl = document.createElement('header');
  headerEl.id = 'app-header';
  headerEl.innerHTML = headerHtml;

  // --- Mobile Nav Construction ---
  let navHtml = visibleMenu.map(m => `
    <a href="${m.path}" class="mob-link ${currentPath.includes(m.path) ? 'active' : ''}">
      ${ICONS[m.icon]}
      <span>${m.label}</span>
    </a>
  `).join('');
  const mobileNavEl = document.createElement('nav');
  mobileNavEl.id = 'app-mobile-nav';
  mobileNavEl.innerHTML = navHtml;

  // Append elements
  document.body.prepend(headerEl);
  document.body.appendChild(mobileNavEl);
}

// Hook into portal load event
window.addEventListener('portalStateLoaded', generateLayout);
