// Apex CRM Enterprise - Frontend JavaScript System

let token = localStorage.getItem('apex_crm_token') || null;
let currentAdminUser = localStorage.getItem('apex_crm_user') || 'Admin';
let leadsData = [];
let statsData = {};
let selectedLeadId = null;
let selectedLeads = []; // Array of selected lead IDs for batch actions
let notificationLogs = []; // In-memory system activity notifications
let pollingTimer = null; // 5-second database check timer

const API_BASE = 'https://crm-4q9r.onrender.com';
// Constants
const COLORS = {
  indigo: '#6366f1',
  blue: '#3b82f6',
  teal: '#0d9488',
  amber: '#f59e0b',
  purple: '#a855f7',
  rose: '#f43f5e',
  emerald: '#10b981',
};

const SOURCE_COLORS = {
  'Website Form': COLORS.indigo,
  'Mobile App Form': COLORS.blue,
  'Marketing Lead': COLORS.purple,
  'Consulting Form': COLORS.amber,
  'Website': COLORS.indigo,
  'Manual Entry': COLORS.teal,
  'Other': COLORS.rose,
};

// ==========================================================================
// API REQUEST HELPER (SAFE PARSING & AUTH)
// ==========================================================================

async function apiRequest(url, options = {}) {
  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const finalHeaders = { ...headers };
  if (options.body && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  const fetchOptions = {
    ...options,
    headers: finalHeaders
  };

  const targetUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const response = await fetch(targetUrl, fetchOptions);

  let data = null;
  const contentType = response.headers.get('content-type');
  
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (e) {
      console.warn('API Warning: Failed to parse JSON body from response.');
    }
  }

  if (!data) {
    try {
      const text = await response.text();
      data = { error: text || `HTTP ${response.status}: ${response.statusText}` };
    } catch (e) {
      data = { error: `HTTP ${response.status}: ${response.statusText}` };
    }
  }

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Server returned error status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  verifySession();
  setupLogin();
  setupNavigation();
  setupKanbanDragAndDrop();
  setupDrawerActions();
  setupSettings();
  setupNotificationBell();
  setupAddLeadModal();
});

// Verify session
async function verifySession() {
  const lockScreen = document.getElementById('lockScreen');
  const appContainer = document.getElementById('appContainer');

  if (!token) {
    showLockScreen();
    return;
  }

  try {
    const data = await apiRequest('/api/auth/verify');
    currentAdminUser = data.username;
    document.getElementById('navAdminUser').textContent = currentAdminUser;
    
    lockScreen.classList.remove('active');
    appContainer.classList.remove('hidden');
    
    // Load initial data and start database poll
    await loadDashboardData();
    startDatabasePolling();
  } catch (error) {
    console.error('Session verification error:', error);
    clearSession();
  }
}

function showLockScreen() {
  document.getElementById('lockScreen').classList.add('active');
  document.getElementById('appContainer').classList.add('hidden');
  document.getElementById('adminUsername').focus();
  stopDatabasePolling();
}

function clearSession() {
  token = null;
  currentAdminUser = 'Admin';
  localStorage.removeItem('apex_crm_token');
  localStorage.removeItem('apex_crm_user');
  showLockScreen();
}

// ==========================================================================
// REAL-TIME POLLING & NOTIFICATION TOASTER SYSTEM
// ==========================================================================

function startDatabasePolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  
  // Check for new leads every 5 seconds
  pollingTimer = setInterval(async () => {
    if (!token) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_BASE}/api/admin/leads`, { headers });
      
      if (res.ok) {
        const latestLeads = await res.json();
        
        // Find if there are new leads that aren't in our local array
        if (leadsData.length > 0 && latestLeads.length > leadsData.length) {
          const newLeads = latestLeads.filter(ll => !leadsData.some(ld => ld.id === ll.id));
          
          // Trigger alert sound & toast notification for each new lead
          newLeads.forEach(lead => {
            showIncomingLeadToast(lead);
            addNotificationLog(`Form Intake: New Lead "${lead.name}" submitted from ${lead.source}.`);
          });

          // Reload all statistics and lists
          leadsData = latestLeads;
          const statsRes = await fetch(`${API_BASE}/api/admin/stats`, { headers });
          if (statsRes.ok) statsData = await statsRes.json();
          
          updateKPICards();
          renderCharts();
          renderFollowUps();
          renderKanban();
        }
      }
    } catch (e) {
      console.warn('Real-time sync check failed:', e.message);
    }
  }, 5000);
}

function stopDatabasePolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

// Synthesize a clean E5 chime using Web Audio API for intake notifications
function playChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Audio Context blocked or not supported
  }
}

function showIncomingLeadToast(lead) {
  playChime();

  const container = document.getElementById('toasterContainer');
  const toast = document.createElement('div');
  toast.className = 'toast-alert';
  
  const budgetText = lead.budget > 0 ? `(₹${Number(lead.budget).toLocaleString('en-IN')})` : '';

  toast.innerHTML = `
    <div class="toast-icon">⚡</div>
    <div class="toast-content">
      <h5>New Lead Submitted</h5>
      <p><strong>${escapeHTML(lead.name)}</strong> from ${escapeHTML(lead.company || 'Individual')} ${budgetText}</p>
      <p style="color: var(--text-muted); font-size: 0.65rem; margin-top: 4px;">Click to view timeline</p>
    </div>
  `;

  // Clicking toast opens the drawer
  toast.addEventListener('click', () => {
    openLeadDrawer(lead.id);
    toast.remove();
  });

  container.appendChild(toast);

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }
  }, 6000);
}

function setupNotificationBell() {
  const bell = document.getElementById('notifBellBtn');
  const panel = document.getElementById('notifPanel');
  const clearBtn = document.getElementById('clearNotifsBtn');

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  panel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  clearBtn.addEventListener('click', () => {
    notificationLogs = [];
    renderNotificationLogs();
  });
}

function addNotificationLog(text) {
  notificationLogs.unshift({
    text,
    time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  renderNotificationLogs();
}

function renderNotificationLogs() {
  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  list.innerHTML = '';

  const count = notificationLogs.length;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  if (count === 0) {
    list.innerHTML = '<div class="empty-state">No new system alerts.</div>';
    return;
  }

  notificationLogs.forEach(notif => {
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerHTML = `
      <span class="notif-item-text">${escapeHTML(notif.text)}</span>
      <span class="notif-item-time">🕒 ${notif.time}</span>
    `;
    list.appendChild(item);
  });
}

// ==========================================================================
// LOGIN MANAGEMENT
// ==========================================================================

function setupLogin() {
  const loginForm = document.getElementById('loginForm');
  const lockCard = document.querySelector('.lock-card');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    const unlockBtn = document.getElementById('unlockBtn');

    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Verifying...';

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      token = data.token;
      currentAdminUser = data.username;
      localStorage.setItem('apex_crm_token', token);
      localStorage.setItem('apex_crm_user', currentAdminUser);

      document.getElementById('navAdminUser').textContent = currentAdminUser;
      document.getElementById('lockScreen').classList.remove('active');
      document.getElementById('appContainer').classList.remove('hidden');

      await loadDashboardData();
      startDatabasePolling();
      loginForm.reset();

    } catch (error) {
      console.error('Login error:', error);
      alert(error.message);
      
      lockCard.classList.add('shake-effect');
      setTimeout(() => lockCard.classList.remove('shake-effect'), 500);
      document.getElementById('adminPassword').value = '';
    } finally {
      unlockBtn.disabled = false;
      unlockBtn.textContent = 'Sign In';
    }
  });

  document.getElementById('lockAppBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
      clearSession();
    }
  });
}

// ==========================================================================
// TAB NAVIGATION
// ==========================================================================

function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute('data-tab');

      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `${targetTab}Tab`) {
          pane.classList.add('active');
        }
      });

      if (targetTab === 'dashboard') {
        renderCharts();
      }
    });
  });
}

// ==========================================================================
// DATA FETCHING & PIPELINE UPDATES
// ==========================================================================

async function loadDashboardData() {
  try {
    const [stats, leads] = await Promise.all([
      apiRequest('/api/admin/stats'),
      apiRequest('/api/admin/leads')
    ]);

    statsData = stats;
    leadsData = leads;

    updateKPICards();
    renderCharts();
    renderFollowUps();
    renderKanban();
    renderRepLeaderboard();

  } catch (error) {
    console.error('Data loading error:', error);
    if (error.message.includes('token') || error.message.includes('denied') || error.message.includes('Unauthorized')) {
      clearSession();
    }
  }
}

function updateKPICards() {
  document.getElementById('statTotalLeads').textContent = statsData.totalLeads || 0;
  document.getElementById('statNewLeads').textContent = statsData.newLeads || 0;
  document.getElementById('statContactedLeads').textContent = statsData.contactedLeads || 0;
  document.getElementById('statConvertedLeads').textContent = statsData.convertedLeads || 0;
  
  // Pipeline value formatted to currency
  const value = statsData.totalPipelineValue || 0;
  document.getElementById('statPipelineValue').textContent = formatCurrency(value);

  const conversionRate = statsData.conversionRate || 0;
  document.getElementById('statConversionRate').textContent = `${conversionRate}%`;
  document.getElementById('conversionRateBar').style.width = `${conversionRate}%`;
}

function renderFollowUps() {
  const followUpsList = document.getElementById('followUpsList');
  const countBadge = document.getElementById('followUpCount');
  
  followUpsList.innerHTML = '';
  const items = statsData.upcomingFollowUps || [];
  countBadge.textContent = items.length;

  if (items.length === 0) {
    followUpsList.innerHTML = '<div class="empty-state">No upcoming follow-ups scheduled.</div>';
    return;
  }

  items.forEach(lead => {
    const card = document.createElement('div');
    card.className = 'follow-up-card';
    card.addEventListener('click', () => openLeadDrawer(lead.id));
    
    const dateObj = new Date(lead.followUpDate);
    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    card.innerHTML = `
      <div class="fu-info">
        <h4>${escapeHTML(lead.name)}</h4>
        <p>${escapeHTML(lead.company || 'Individual')} • Assigned to ${escapeHTML(lead.assignedTo)}</p>
      </div>
      <div class="fu-date">🗓️ ${dateStr}</div>
    `;
    followUpsList.appendChild(card);
  });
}

function renderRepLeaderboard() {
  const list = document.getElementById('repLeaderboard');
  list.innerHTML = '';

  const reps = statsData.agentPerformance || [];
  
  if (reps.length === 0) {
    list.innerHTML = '<div class="empty-state">No performance stats.</div>';
    return;
  }

  reps.forEach(rep => {
    // If the representative has no assignments, skip them
    if (rep.assigned === 0 && rep.name === 'Unassigned') return;

    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    
    const initials = rep.name.split(' ').map(n => n[0]).join('').substring(0, 2);

    item.innerHTML = `
      <div class="leaderboard-item-name">
        <span class="rep-avatar">${initials}</span>
        <div>
          <div>${escapeHTML(rep.name)}</div>
          <span class="leaderboard-item-sub">${rep.converted}/${rep.assigned} converted</span>
        </div>
      </div>
      <span class="leaderboard-item-value">${formatCurrency(rep.value)}</span>
    `;
    list.appendChild(item);
  });
}



// ==========================================================================
// HTML5 CANVAS CHART DRAWING routines
// ==========================================================================

function renderCharts() {
  renderSourcesChart();
  renderTrendsChart();
  renderFunnelChart();
}

function renderSourcesChart() {
  const canvas = document.getElementById('sourcesChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 180;

  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, size, size);

  const sources = statsData.sources || {};
  const total = Object.values(sources).reduce((a, b) => a + b, 0);

  const legend = document.getElementById('sourcesLegend');
  legend.innerHTML = '';

  if (total === 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(size/2, size/2, 55, 0, 2*Math.PI);
    ctx.stroke();
    
    ctx.fillStyle = COLORS.indigo;
    ctx.font = '600 10px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Data', size/2, size/2);
    return;
  }

  let startAngle = -Math.PI / 2;
  const keys = Object.keys(sources);

  keys.forEach((key) => {
    const val = sources[key];
    const sliceAngle = (val / total) * 2 * Math.PI;
    const color = SOURCE_COLORS[key] || SOURCE_COLORS['Other'];

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size/2, size/2);
    ctx.arc(size/2, size/2, 65, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();

    startAngle += sliceAngle;

    const pct = Math.round((val / total) * 100);
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <span class="legend-dot" style="background-color: ${color}"></span>
      <span>${escapeHTML(key)} (${pct}%)</span>
    `;
    legend.appendChild(legendItem);
  });

  ctx.fillStyle = '#0d1222';
  ctx.beginPath();
  ctx.arc(size/2, size/2, 45, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = COLORS.indigo;
  ctx.font = '800 18px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, size/2, size/2 - 6);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 8px "Inter", sans-serif';
  ctx.fillText('LEADS', size/2, size/2 + 10);
}

function renderTrendsChart() {
  const canvas = document.getElementById('trendsChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = 380;
  const height = 180;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  const trends = statsData.monthlyTrends || [];
  if (trends.length === 0) {
    ctx.fillStyle = COLORS.indigo;
    ctx.font = '500 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No inflow trends', width/2, height/2);
    return;
  }

  const padding = { top: 20, bottom: 25, left: 30, right: 15 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(...trends.map(t => t.count), 4);

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + graphHeight - (i / 4) * graphHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '500 8px "Courier New"';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round((i / 4) * maxVal), padding.left - 8, y);
  }

  ctx.beginPath();
  const points = [];
  trends.forEach((t, i) => {
    const x = padding.left + (i / Math.max(trends.length - 1, 1)) * graphWidth;
    const y = padding.top + graphHeight - (t.count / maxVal) * graphHeight;
    points.push({ x, y, label: t.month.substring(5) });
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.strokeStyle = COLORS.indigo;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (points.length > 0) {
    ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
    ctx.lineTo(points[0].x, padding.top + graphHeight);
    ctx.closePath();
    
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
    grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  points.forEach((p, idx) => {
    ctx.fillStyle = COLORS.blue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, 2*Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#060913';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 8px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    if (trends.length <= 6 || idx === 0 || idx === trends.length - 1 || idx === Math.floor(trends.length/2)) {
      ctx.fillText(p.label, p.x, padding.top + graphHeight + 6);
    }
  });
}

function renderFunnelChart() {
  const canvas = document.getElementById('funnelChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 180;

  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, size, size);

  const funnel = statsData.funnel || { intake: 0, contacted: 0, qualified: 0, converted: 0 };
  const stages = [
    { label: 'Intake', val: funnel.intake, color: COLORS.indigo },
    { label: 'Contacted', val: funnel.contacted, color: COLORS.blue },
    { label: 'Qualified', val: funnel.qualified, color: COLORS.amber },
    { label: 'Converted', val: funnel.converted, color: COLORS.emerald }
  ];

  const maxVal = Math.max(funnel.intake, 1);
  const padding = { top: 15, bottom: 10, left: 10, right: 10 };
  const graphWidth = size - padding.left - padding.right;
  const graphHeight = size - padding.top - padding.bottom;
  const rowHeight = graphHeight / 4;

  stages.forEach((stage, idx) => {
    const w = Math.max((stage.val / maxVal) * graphWidth, 15);
    const x = padding.left + (graphWidth - w) / 2;
    const y = padding.top + idx * rowHeight;
    const barHeight = rowHeight * 0.65;

    // Draw horizontal tapering bar
    ctx.fillStyle = stage.color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, barHeight, 6);
    ctx.fill();

    // Stage labels inside or above the bar
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 8px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${stage.label}: ${stage.val}`, size/2, y + barHeight/2);

    // Percentage drop down indicator
    if (idx < 3) {
      const nextStage = stages[idx + 1];
      const pct = stage.val > 0 ? Math.round((nextStage.val / stage.val) * 100) : 0;
      ctx.fillStyle = '#64748b';
      ctx.font = '500 7px "Courier New"';
      ctx.textAlign = 'center';
      ctx.fillText(`↓ ${pct}% conversion`, size/2, y + barHeight + (rowHeight - barHeight)/2);
    }
  });
}

// ==========================================================================
// KANBAN BOARD SYSTEM
// ==========================================================================

function renderKanban() {
  const columns = ['new', 'contacted', 'converted', 'lost'];
  
  columns.forEach(col => {
    document.getElementById(`cards-${col}`).innerHTML = '';
    document.getElementById(`count-${col}`).textContent = 0;
  });

  const searchInput = document.querySelector('.kanban-search').value.toLowerCase().trim();

  const filtered = leadsData.filter(lead => {
    return !searchInput || 
      lead.name.toLowerCase().includes(searchInput) ||
      (lead.company && lead.company.toLowerCase().includes(searchInput)) ||
      (lead.assignedTo && lead.assignedTo.toLowerCase().includes(searchInput));
  });

  filtered.forEach(lead => {
    const status = (lead.status || 'new').toLowerCase();
    const listContainer = document.getElementById(`cards-${status}`);
    if (!listContainer) return;

    // Accumulate column count
    const countIndicator = document.getElementById(`count-${status}`);
    countIndicator.textContent = parseInt(countIndicator.textContent || 0, 10) + 1;

    const card = document.createElement('div');
    card.className = 'lead-card animate-fade-in';
    card.setAttribute('draggable', 'true');
    card.setAttribute('id', `kanban-${lead.id}`);
    card.style.setProperty('--card-accent', SOURCE_COLORS[lead.source] || SOURCE_COLORS['Other']);

    const initials = (lead.assignedTo || 'U').split(' ').map(n => n[0]).join('').substring(0, 2);
    const budgetStr = lead.budget > 0 ? `<strong>₹${Number(lead.budget).toLocaleString('en-IN')}</strong>` : '₹0';
    const notesCount = (lead.notes || []).length;
    const notesCountHtml = notesCount > 0 ? `<span>💬 ${notesCount}</span>` : '';

    card.innerHTML = `
      <div class="lead-card-header">
        <span class="lead-source-badge">${escapeHTML(lead.source)}</span>
        <span class="badge-temp ${escapeHTML(lead.temperature || 'warm')}">${escapeHTML(lead.temperature || 'warm')}</span>
      </div>
      <div class="lead-card-name">${escapeHTML(lead.name)}</div>
      <div class="lead-card-company">${escapeHTML(lead.company || 'No Company')}</div>
      <div style="font-size: 0.8rem; margin-bottom: 6px;">Budget: <span class="lead-budget-val">${budgetStr}</span></div>
      <div class="lead-card-footer">
        <div class="rep-row">
          <span class="rep-avatar" title="Rep: ${escapeHTML(lead.assignedTo)}">${initials}</span>
          <span class="lead-card-date">${formatDate(lead.createdAt)}</span>
        </div>
        <div class="lead-card-notes-count">${notesCountHtml}</div>
      </div>
    `;

    card.addEventListener('click', () => openLeadDrawer(lead.id));

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', lead.id);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    listContainer.appendChild(card);
  });
}

function setupKanbanDragAndDrop() {
  const columns = document.querySelectorAll('.kanban-column');
  
  columns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      
      const leadId = e.dataTransfer.getData('text/plain');
      const targetStatus = col.getAttribute('data-status');

      if (!leadId || !targetStatus) return;

      try {
        await apiRequest(`/api/admin/leads/${leadId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: targetStatus })
        });
        await loadDashboardData();
        addNotificationLog(`Lead status updated: Dragged lead ID ${leadId} to ${targetStatus.toUpperCase()}.`);
      } catch (error) {
        console.error('Drag update error:', error);
        alert(error.message);
      }
    });
  });

  document.querySelector('.kanban-search').addEventListener('input', renderKanban);
}



// ==========================================================================
// LEAD DETAILS DRAWER
// ==========================================================================

async function openLeadDrawer(leadId) {
  selectedLeadId = leadId;
  const drawer = document.getElementById('leadDrawer');

  try {
    const lead = await apiRequest(`/api/admin/leads/${leadId}`);

    document.getElementById('drawerSource').textContent = lead.source;
    document.getElementById('drawerName').textContent = lead.name;
    document.getElementById('drawerEmail').textContent = lead.email;
    document.getElementById('drawerPhone').textContent = lead.phone || 'N/A';
    document.getElementById('drawerCompany').textContent = lead.company || 'Individual';
    document.getElementById('drawerCreatedDate').textContent = new Date(lead.createdAt).toLocaleString();
    
    document.getElementById('drawerStatusSelect').value = lead.status;
    document.getElementById('drawerPrioritySelect').value = lead.priority;
    document.getElementById('drawerRepSelect').value = lead.assignedTo || 'Unassigned';
    document.getElementById('drawerTemperatureSelect').value = lead.temperature || 'warm';
    document.getElementById('drawerBudgetInput').value = lead.budget || '';
    document.getElementById('drawerFollowUpDate').value = lead.followUpDate || '';

    renderDrawerTimeline(lead.notes || []);
    drawer.classList.add('active');

  } catch (error) {
    console.error('Open drawer error:', error);
    alert('Failed to load lead details: ' + error.message);
  }
}

function closeLeadDrawer() {
  document.getElementById('leadDrawer').classList.remove('active');
  selectedLeadId = null;
}

function renderDrawerTimeline(notes) {
  const timeline = document.getElementById('drawerNotesTimeline');
  timeline.innerHTML = '';

  if (notes.length === 0) {
    timeline.innerHTML = '<div class="empty-state">No timeline events recorded.</div>';
    return;
  }

  notes.forEach(note => {
    const item = document.createElement('div');
    
    // Differentiate system transfer audit tags visually
    let typeClass = 'timeline-item';
    if (note.author === 'System') typeClass += ' system';
    else if (note.author === 'Form Intake') typeClass += ' form';
    
    item.className = typeClass;
    
    const dateStr = new Date(note.date).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-item-header">
        <span class="timeline-item-author">${escapeHTML(note.author)}</span>
        <span>${dateStr}</span>
      </div>
      <div class="timeline-item-content">
        ${escapeHTML(note.content)}
      </div>
    `;
    timeline.appendChild(item);
  });
}

function setupDrawerActions() {
  const closeBtn = document.getElementById('closeDrawerBtn');
  const backdrop = document.getElementById('drawerBackdrop');
  const addNoteForm = document.getElementById('drawerAddNoteForm');
  const pipelineForm = document.getElementById('drawerPipelineForm');
  const deleteBtn = document.getElementById('drawerDeleteLeadBtn');

  closeBtn.addEventListener('click', closeLeadDrawer);
  backdrop.addEventListener('click', closeLeadDrawer);

  addNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedLeadId) return;

    const noteInput = document.getElementById('drawerNoteInput');
    const content = noteInput.value.trim();

    try {
      const updatedLead = await apiRequest(`/api/admin/leads/${selectedLeadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content })
      });

      renderDrawerTimeline(updatedLead.notes || []);
      noteInput.value = '';
      await loadDashboardData();
      addNotificationLog(`Lead ID ${selectedLeadId}: Added timeline activity note.`);

    } catch (error) {
      console.error('Add note error:', error);
      alert('Failed to save note: ' + error.message);
    }
  });

  pipelineForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedLeadId) return;

    const status = document.getElementById('drawerStatusSelect').value;
    const priority = document.getElementById('drawerPrioritySelect').value;
    const assignedTo = document.getElementById('drawerRepSelect').value;
    const temperature = document.getElementById('drawerTemperatureSelect').value;
    const budget = document.getElementById('drawerBudgetInput').value || 0;
    const followUpDate = document.getElementById('drawerFollowUpDate').value || null;

    try {
      const updatedLead = await apiRequest(`/api/admin/leads/${selectedLeadId}`, {
        method: 'PUT',
        body: JSON.stringify({ status, priority, assignedTo, temperature, budget, followUpDate })
      });

      renderDrawerTimeline(updatedLead.notes || []);
      await loadDashboardData();
      alert('Pipeline details saved successfully!');
      addNotificationLog(`Lead ID ${selectedLeadId}: Updated pipeline criteria.`);

    } catch (error) {
      console.error('Drawer update error:', error);
      alert('Failed to save details: ' + error.message);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!selectedLeadId) return;

    if (confirm('WARNING: Are you sure you want to permanently delete this lead? This cannot be undone.')) {
      try {
        await apiRequest(`/api/admin/leads/${selectedLeadId}`, {
          method: 'DELETE'
        });
        addNotificationLog(`Pipeline: Deleted lead ID ${selectedLeadId}.`);
        closeLeadDrawer();
        await loadDashboardData();
        alert('Lead deleted successfully.');
      } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete lead: ' + error.message);
      }
    }
  });
}

// ==========================================================================
// SETTINGS OPERATIONS
// ==========================================================================

function setupSettings() {
  const changePasswordForm = document.getElementById('changePasswordForm');
  const resetBtn = document.getElementById('resetAllLeadsBtn');

  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPass = document.getElementById('settingsNewPassword').value.trim();
    const confPass = document.getElementById('settingsConfirmPassword').value.trim();

    if (newPass !== confPass) {
      alert('Passwords do not match!');
      return;
    }

    try {
      await apiRequest('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPass })
      });

      alert('Password updated successfully!');
      changePasswordForm.reset();

    } catch (error) {
      console.error('Change password error:', error);
      alert(error.message);
    }
  });

  resetBtn.addEventListener('click', async () => {
    if (confirm('CRITICAL WARNING: This will delete ALL leads and notes in your system forever. Do you wish to proceed?')) {
      if (confirm('Are you absolutely certain? This operation is irreversible.')) {
        try {
          const leads = await apiRequest('/api/admin/leads');

          for (let i = 0; i < leads.length; i++) {
            await apiRequest(`/api/admin/leads/${leads[i].id}`, {
              method: 'DELETE'
            });
          }

          addNotificationLog(`Database Reset: Flushed all records and stats from local database.`);
          await loadDashboardData();
          alert('Database reset successful. All leads cleared.');

        } catch (error) {
          console.error('Database reset error:', error);
          alert('Error during pipeline reset: ' + error.message);
        }
      }
    }
  });
}

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================

function formatDate(isoString) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(num);
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// ADD LEAD MODAL MANAGEMENT
// ==========================================================================

function setupAddLeadModal() {
  const modal = document.getElementById('addLeadModal');
  const addBtnKanban = document.getElementById('addLeadBtnKanban');
  const closeBtn = document.getElementById('closeAddLeadModalBtn');
  const cancelBtn = document.getElementById('cancelAddLeadBtn');
  const addLeadForm = document.getElementById('addLeadForm');

  if (!modal) return;

  const openModal = () => {
    modal.classList.remove('hidden');
    document.getElementById('newLeadName').focus();
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    addLeadForm.reset();
  };

  if (addBtnKanban) addBtnKanban.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  addLeadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('newLeadName').value.trim();
    const email = document.getElementById('newLeadEmail').value.trim();
    const phone = document.getElementById('newLeadPhone').value.trim();
    const company = document.getElementById('newLeadCompany').value.trim();
    const budget = document.getElementById('newLeadBudget').value || 0;
    const source = document.getElementById('newLeadSource').value;
    const priority = document.getElementById('newLeadPriority').value;
    const temperature = document.getElementById('newLeadTemp').value;
    const assignedTo = document.getElementById('newLeadRep').value;
    const followUpDate = document.getElementById('newLeadFollowUp').value || null;
    const message = document.getElementById('newLeadMessage').value.trim();

    const saveBtn = addLeadForm.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const data = await apiRequest('/api/admin/leads', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          phone,
          company,
          budget,
          source,
          priority,
          temperature,
          assignedTo,
          followUpDate,
          message
        })
      });

      if (data.success) {
        addNotificationLog(`Pipeline: Manually added new lead "${name}".`);
        closeModal();
        await loadDashboardData();
        alert('Lead added successfully!');
      }
    } catch (error) {
      console.error('Error adding lead:', error);
      alert('Failed to add lead: ' + error.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Lead';
    }
  });
}
