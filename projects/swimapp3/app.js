/**
 * Swim App - Frontend Logic (app.js)
 * Fetches local swim data, filters for target pools/times,
 * and renders interactive dashboard views.
 */

// Target pool configurations
const POOLS = {
  58: { name: 'Jimmie Simpson', type: 'Indoor', id: 58 },
  234: { name: 'Matty Eckler', type: 'Indoor', id: 234 },
  145: { name: 'Monarch Park', type: 'Outdoor', id: 145 },
  70: { name: 'Greenwood Park', type: 'Outdoor', id: 70 },
  437: { name: 'Donald D. Summerville', type: 'Outdoor', id: 437 },
  2012: { name: 'Pam McConnell', type: 'Indoor', id: 2012 }
};

// State management
let rawSchedules = [];
let filteredSchedules = [];
let currentView = 'day'; // 'day' or 'pool'
let searchFilter = '';
let typeFilter = 'all'; // 'all', 'indoor', 'outdoor'

// DOM Elements
const scheduleDisplay = document.getElementById('schedule-display');
const viewToggle = document.getElementById('view-toggle-control');
const groupDayBtn = document.getElementById('group-day-btn');
const groupPoolBtn = document.getElementById('group-pool-btn');
const searchInput = document.getElementById('pool-search-input');
const filterChips = document.getElementById('pool-filter-chips');
const lastUpdatedText = document.getElementById('last-updated-text');



/**
 * Initialize application
 */
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initBeachCollapse();
  loadData();
});

/**
 * Set up event handlers
 */
function initEventListeners() {
  // Toggle layout view
  viewToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    
    const view = btn.dataset.view;
    setView(view);
  });

  // Search input filter
  searchInput.addEventListener('input', (e) => {
    searchFilter = e.target.value.toLowerCase().trim();
    applyFiltersAndRender();
  });

  // Type filter chips
  filterChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    // Toggle active state
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    typeFilter = chip.dataset.filter;
    applyFiltersAndRender();
  });
}

/**
 * Switch dashboard view (Day vs Pool)
 */
function setView(view) {
  if (currentView === view) return;
  currentView = view;

  // Update DOM classes for slide effect
  viewToggle.setAttribute('data-active', view);
  
  if (view === 'day') {
    groupDayBtn.classList.add('active');
    groupDayBtn.setAttribute('aria-checked', 'true');
    groupPoolBtn.classList.remove('active');
    groupPoolBtn.setAttribute('aria-checked', 'false');
  } else {
    groupPoolBtn.classList.add('active');
    groupPoolBtn.setAttribute('aria-checked', 'true');
    groupDayBtn.classList.remove('active');
    groupDayBtn.setAttribute('aria-checked', 'false');
  }

  renderDashboard();
}

/**
 * Fetch local data files
 */
async function loadData() {
  showLoading(true);
  try {
    const [swimRes, beachRes] = await Promise.all([
      fetch('./swim-data.json'),
      fetch('./beach-data.json')
    ]);

    if (!swimRes.ok) {
      throw new Error(`Swim data HTTP error! status: ${swimRes.status}`);
    }
    const swimData = await swimRes.json();
    
    let beachData = null;
    if (beachRes.ok) {
      beachData = await beachRes.json();
    } else {
      console.warn('Beach data not available, status:', beachRes.status);
    }

    // Set last updated text
    const now = new Date();
    lastUpdatedText.textContent = `Last sync: Today at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    processData(swimData);
    
    if (beachData) {
      renderBeachConditions(beachData);
    }
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    showError('Could not load data. Please ensure the local server is running and data is fetched.');
  } finally {
    showLoading(false);
  }
}

/**
 * Parse and clean the raw CKAN records
 */
function processData(records) {
  const processed = [];
  const now = new Date();
  
  // Set today's date boundary at midnight for range checks
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // 7-day rolling window end (exclusive of day 8, i.e. 7 days fully inclusive)
  const rollingEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  rollingEnd.setHours(23, 59, 59, 999);

  records.forEach(r => {
    // 1. Filter for exact match of "Lane Swim" (trimmed)
    const courseTitle = r['Course Title'] ? r['Course Title'].trim() : '';
    if (courseTitle !== 'Lane Swim') return;

    // 2. Filter for target Location IDs
    const locId = Number(r['Location ID']);
    if (!POOLS[locId]) return;

    // 3. Parse Date: API date comes in "YYYY-MM-DD"
    const dateStr = r['First Date'];
    if (!dateStr) return;

    const [year, month, day] = dateStr.split('-').map(Number);
    const startHour = Number(r['Start Hour']);
    const startMin = Number(r['Start Minute']);
    const endHour = Number(r['End Hour']);
    const endMin = Number(r['End Min']); // Note: API field is 'End Min'

    // Create session dates in local timezone
    const sessionStart = new Date(year, month - 1, day, startHour, startMin, 0, 0);
    const sessionEnd = new Date(year, month - 1, day, endHour, endMin, 0, 0);

    // 4. Discard past sessions (if the session's end time is before now)
    if (sessionEnd < now) return;

    // 5. Discard sessions outside rolling 7-day window
    if (sessionStart < todayStart || sessionStart > rollingEnd) return;

    // Calculate duration in minutes/hours
    const durationMin = Math.round((sessionEnd - sessionStart) / 60000);
    const durationText = durationMin >= 60 
      ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ''}`
      : `${durationMin}m`;

    processed.push({
      id: r._id || Math.random().toString(36).substr(2, 9),
      locationId: locId,
      poolName: POOLS[locId].name,
      poolType: POOLS[locId].type,
      start: sessionStart,
      end: sessionEnd,
      duration: durationText,
      ageMin: r['Age Min'] || 'All',
      ageMax: r['Age Max'] || 'None',
      dayOfWeek: r['DayOftheWeek']
    });
  });

  // Sort chronologically by start time
  rawSchedules = processed.sort((a, b) => a.start - b.start);
  
  // Render dashboard
  applyFiltersAndRender();
}

/**
 * Filter raw schedules based on user selections
 */
function applyFiltersAndRender() {
  filteredSchedules = rawSchedules.filter(s => {
    // Search filter
    const matchesSearch = s.poolName.toLowerCase().includes(searchFilter);
    
    // Type filter
    const matchesType = typeFilter === 'all' || 
      (typeFilter === 'indoor' && s.poolType === 'Indoor') ||
      (typeFilter === 'outdoor' && s.poolType === 'Outdoor');

    return matchesSearch && matchesType;
  });

  renderDashboard();
}



/**
 * Render the dashboard content based on the active view
 */
function renderDashboard() {
  scheduleDisplay.innerHTML = '';

  if (filteredSchedules.length === 0) {
    renderEmptyState();
    return;
  }

  if (currentView === 'day') {
    renderGroupByDay();
  } else {
    renderGroupByPool();
  }
}

/**
 * Render Day Grouping: Today, Tomorrow, The Week Ahead
 */
function renderGroupByDay() {
  const now = new Date();
  
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekAheadStart = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

  // Split into columns
  const todaySessions = filteredSchedules.filter(s => s.start < tomorrowStart);
  const tomorrowSessions = filteredSchedules.filter(s => s.start >= tomorrowStart && s.start < weekAheadStart);
  const weekSessions = filteredSchedules.filter(s => s.start >= weekAheadStart);

  const groups = [
    { name: 'Today', key: 'today', sessions: todaySessions, class: 'section-today' },
    { name: 'Tomorrow', key: 'tomorrow', sessions: tomorrowSessions, class: 'section-tomorrow' },
    { name: 'The Week Ahead', key: 'week', sessions: weekSessions, class: 'section-week' }
  ];

  groups.forEach(g => {
    if (g.sessions.length === 0) return;

    const section = document.createElement('section');
    section.className = `schedule-section ${g.class || ''}`;
    
    // Determine meta info (e.g. date subtitle)
    let metaText = '';
    if (g.key === 'today') {
      metaText = formatDateMeta(now);
    } else if (g.key === 'tomorrow') {
      metaText = formatDateMeta(tomorrowStart);
    } else {
      metaText = `${g.sessions.length} sessions`;
    }

    section.innerHTML = `
      <div class="section-header-row">
        <h2 class="section-title">${g.name}</h2>
        <span class="section-meta">${metaText}</span>
      </div>
      <div class="session-cards-grid"></div>
    `;

    const grid = section.querySelector('.session-cards-grid');
    g.sessions.forEach(s => {
      grid.appendChild(createSwimCard(s, { showDate: g.key === 'week' }));
    });

    scheduleDisplay.appendChild(section);
  });
}

/**
 * Render Pool Grouping: Each pool section sorted chronologically
 */
function renderGroupByPool() {
  // Group sessions by pool ID
  const poolGroups = {};
  
  // Ensure we structure it for all pools that have sessions
  filteredSchedules.forEach(s => {
    if (!poolGroups[s.locationId]) {
      poolGroups[s.locationId] = {
        poolId: s.locationId,
        poolName: s.poolName,
        poolType: s.poolType,
        sessions: []
      };
    }
    poolGroups[s.locationId].sessions.push(s);
  });

  // Convert to array and sort pools alphabetically or by ID
  const groups = Object.values(poolGroups).sort((a, b) => a.poolName.localeCompare(b.poolName));

  groups.forEach(g => {
    const section = document.createElement('section');
    section.className = 'schedule-section';

    section.innerHTML = `
      <div class="section-header-row">
        <h2 class="section-title">
          ${g.poolName}
          <span class="pool-type-badge badge-${g.poolType.toLowerCase()}">${g.poolType}</span>
        </h2>
        <span class="section-meta">${g.sessions.length} scheduled</span>
      </div>
      <div class="session-cards-grid"></div>
    `;

    const grid = section.querySelector('.session-cards-grid');
    g.sessions.forEach(s => {
      // Group by pool already shows pool header, so card title should show the date!
      grid.appendChild(createSwimCard(s, { showDate: true, showPoolHeader: false }));
    });

    scheduleDisplay.appendChild(section);
  });
}

/**
 * Helper to build an individual swim session card component
 */
function createSwimCard(session, options = {}) {
  const { showDate = false, showPoolHeader = true } = options;
  const now = new Date();
  
  const card = document.createElement('article');
  card.className = `swim-card pool-${session.poolType.toLowerCase()}`;
  card.setAttribute('data-id', session.id);

  // Time formatting
  const timeString = `${formatTime(session.start)} – ${formatTime(session.end)}`;
  
  // Status check (Live)
  const isLive = session.start <= now && now <= session.end;

  // Left column: Pool name + badge OR Date
  let leftHtml = '';
  if (showPoolHeader) {
    leftHtml = `
      <div class="swim-info-group">
        <h3 class="pool-name">${session.poolName}</h3>
        <span class="pool-type-badge badge-${session.poolType.toLowerCase()}">${session.poolType}</span>
      </div>
    `;
  } else {
    leftHtml = `
      <h3 class="pool-name">${formatCardHeaderDate(session.start)}</h3>
    `;
  }

  // Right column: Session date (optional) + Time container
  const dateHtml = (showDate && showPoolHeader)
    ? `<span class="swim-date">${formatCardBodyDate(session.start)}</span>`
    : '';

  card.innerHTML = `
    <div class="swim-row-left">
      ${leftHtml}
    </div>
    <div class="swim-row-right">
      ${dateHtml}
      <div class="time-container">
        <svg class="clock-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span class="swim-time${isLive ? ' time-live' : ''}">${timeString}</span>
        <span class="swim-duration">(${session.duration})</span>
      </div>
    </div>
  `;

  return card;
}

/**
 * Format Date objects
 */
function formatDateMeta(date) {
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatCardHeaderDate(date) {
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatCardBodyDate(date) {
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatTime(date) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  
  const minStr = String(minutes).padStart(2, '0');
  
  // Clean representation, drop minutes if they are 00 (e.g. 12 PM instead of 12:00 PM) for visual cleanliness
  return minutes === 0 ? `${hours} ${ampm}` : `${hours}:${minStr} ${ampm}`;
}

/**
 * Show/Hide loading UI
 */
function showLoading(show) {
  const spinner = document.getElementById('loading-spinner');
  if (spinner) {
    spinner.style.display = show ? 'flex' : 'none';
  }
}

/**
 * Render Empty State
 */
function renderEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <span class="empty-state-icon">🏊‍♀️🚫</span>
    <h3>No Swims Scheduled</h3>
    <p>There are no active lane swim sessions matching your search or filters at the selected pools for the next 7 days.</p>
  `;
  scheduleDisplay.appendChild(div);
}

/**
 * Render Error message
 */
function showError(message) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.style.borderColor = 'rgba(239, 68, 68, 0.3)';
  div.innerHTML = `
    <span class="empty-state-icon">⚠️</span>
    <h3>Connection Error</h3>
    <p>${message}</p>
    <button class="chip active" style="margin-top: 1rem;" onclick="location.reload()">Retry Load</button>
  `;
  scheduleDisplay.appendChild(div);
}

/**
 * Render beach conditions cards (e.g. Cherry Beach temperature & E.coli status)
 */
function renderBeachConditions(beachData) {
  const panel = document.getElementById('beach-display-panel');
  if (!panel) return;

  panel.innerHTML = '';

  const beaches = Object.values(beachData).filter(Boolean);
  if (beaches.length === 0) return;

  // Boundary for "today" to detect stale data
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  beaches.forEach(beach => {
    const card = document.createElement('a');
    card.className = 'beach-card';
    const slug = beach.name.toLowerCase().replace(/\s+/g, '-');
    card.href = `https://www.openwaterdata.com/site/${slug}`;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    // Temp display
    let tempHtml = '<span class="metric-value-large">—</span>';
    let tempUpdateText = 'No temp reading';
    let tempVal = null;
    let tempStatusClass = '';
    let isTempStale = false;
    let tempStaleBadge = '';
    
    if (beach.waterTemp) {
      tempVal = beach.waterTemp.value;
      const tempDate = new Date(beach.waterTemp.time);
      isTempStale = isNaN(tempDate.getTime()) || tempDate < todayStart;
      
      const tempValStr = typeof tempVal === 'number' 
        ? `${tempVal.toFixed(1)}<span class="metric-value-unit">°C</span>`
        : '—';
      tempHtml = `<span class="metric-value-large">${tempValStr}</span>`;
      tempUpdateText = `Updated ${formatBeachDate(tempDate)}, ${formatBeachTime(tempDate)}<span class="metric-source">via ${beach.waterTemp.collector}</span>`;
      
      // Determine individual box status class
      if (isTempStale) {
        tempStatusClass = 'status-stale';
        tempStaleBadge = '<span class="stale-warning">⚠️ STALE</span>';
      } else if (typeof tempVal === 'number') {
        if (tempVal >= 18) tempStatusClass = 'status-safe';
        else if (tempVal >= 13) tempStatusClass = 'status-warning';
        else tempStatusClass = 'status-danger';
      }
    }

    // Ecoli display
    let ecoliHtml = '<span class="metric-value-large">—</span>';
    let ecoliUpdateText = 'No quality reading';
    let ecoliVal = null;
    let ecoliStatusClass = '';
    
    if (beach.ecoli) {
      ecoliVal = beach.ecoli.value;
      const ecoliValStr = typeof ecoliVal === 'number' 
        ? `${ecoliVal}<span class="metric-value-unit"> CFU</span>`
        : '—';
      ecoliHtml = `<span class="metric-value-large">${ecoliValStr}</span>`;
      const ecoliDate = new Date(beach.ecoli.time);
      ecoliUpdateText = `Tested ${formatBeachDate(ecoliDate)}<span class="metric-source">via ${beach.ecoli.collector}</span>`;
      
      // Determine Ecoli box status class
      if (typeof ecoliVal === 'number') {
        if (ecoliVal <= 100) ecoliStatusClass = 'status-safe';
        else ecoliStatusClass = 'status-danger';
      }
    }

    // Wave height display
    let waveHtml = '<span class="metric-value-large">—</span>';
    let waveUpdateText = 'No wave reading';
    let waveVal = null;
    let waveStatusClass = '';
    let isWaveStale = false;
    let waveStaleBadge = '';
    
    if (beach.waveHeight) {
      waveVal = beach.waveHeight.value; // in meters
      
      // Format wave timestamp and source
      const waveTimeStr = beach.waveHeight.time;
      let waveDate = null;
      if (waveTimeStr) {
        const cleanTimeStr = waveTimeStr.replace(/\s+at\s+/i, ' ').replace(/([ap]m)$/i, ' $1').toUpperCase();
        waveDate = new Date(cleanTimeStr);
        isWaveStale = isNaN(waveDate.getTime()) || waveDate < todayStart;
      } else {
        isWaveStale = true;
      }
      
      const waveValStr = typeof waveVal === 'number' 
        ? `${waveVal.toFixed(1)}<span class="metric-value-unit">m</span>`
        : '—';
      waveHtml = `<span class="metric-value-large">${waveValStr}</span>`;
      
      if (waveDate && !isNaN(waveDate.getTime())) {
        waveUpdateText = `Observed ${formatBeachDate(waveDate)}, ${formatBeachTime(waveDate)}<span class="metric-source">via ${beach.waveHeight.collector}</span>`;
      } else {
        waveUpdateText = `Observed ${waveTimeStr || 'Unknown'}<span class="metric-source">via ${beach.waveHeight.collector}</span>`;
      }
      
      // Determine wave box status class based on meters:
      if (isWaveStale) {
        waveStatusClass = 'status-stale';
        waveStaleBadge = '<span class="stale-warning">⚠️ STALE</span>';
      } else if (typeof waveVal === 'number') {
        if (waveVal <= 0.3) waveStatusClass = 'status-safe';
        else if (waveVal < 0.7) waveStatusClass = 'status-warning';
        else waveStatusClass = 'status-danger';
      }
    }

    // Combined safety status criteria (ignoring stale values for safety badge computation)
    let statusBadge = '';
    const activeTempVal = isTempStale ? null : tempVal;
    const activeWaveVal = isWaveStale ? null : waveVal;

    const isEcoliUnsafe = ecoliVal !== null && ecoliVal > 100;
    const isWaveDanger = activeWaveVal !== null && activeWaveVal >= 0.7;
    const isWaveCaution = activeWaveVal !== null && activeWaveVal > 0.3 && activeWaveVal < 0.7;
    const isTempCold = activeTempVal !== null && activeTempVal < 13;
    const isTempCaution = activeTempVal !== null && activeTempVal >= 13 && activeTempVal < 18;
    
    let statusColorClass = 'status-unknown';
    if (ecoliVal === null && activeTempVal === null && activeWaveVal === null) {
      statusBadge = `<span class="ecoli-badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid var(--card-border);">Unknown Conditions</span>`;
      statusColorClass = 'status-unknown';
    } else if (isEcoliUnsafe) {
      statusBadge = `<span class="ecoli-badge ecoli-unsafe">Unsafe (E.coli)</span>`;
      statusColorClass = 'status-danger';
    } else if (isWaveDanger) {
      statusBadge = `<span class="ecoli-badge ecoli-unsafe">Rough Waves</span>`;
      statusColorClass = 'status-danger';
    } else if (isTempCold) {
      statusBadge = `<span class="ecoli-badge ecoli-unsafe">Too Cold</span>`;
      statusColorClass = 'status-danger';
    } else if (isWaveCaution) {
      statusBadge = `<span class="ecoli-badge ecoli-warning">Caution (Waves)</span>`;
      statusColorClass = 'status-warning';
    } else if (isTempCaution) {
      statusBadge = `<span class="ecoli-badge ecoli-warning">Wetsuit Rec.</span>`;
      statusColorClass = 'status-warning';
    } else {
      // Ecoli, temp, waves are physically safe, but if temp or waves are stale or missing,
      // we must show Unknown Conditions to prevent false safety assurances.
      if (tempVal === null || isTempStale || waveVal === null || isWaveStale) {
        statusBadge = `<span class="ecoli-badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid var(--card-border);">Unknown Conditions</span>`;
        statusColorClass = 'status-unknown';
      } else {
        statusBadge = `<span class="ecoli-badge ecoli-safe">Safe to Swim</span>`;
        statusColorClass = 'status-safe';
      }
    }

    card.className = `beach-card ${statusColorClass}`;
    card.innerHTML = `
      <div class="beach-card-header">
        <div>
          <h3 class="beach-name">${beach.name}</h3>
        </div>
        ${statusBadge}
      </div>
      <div class="beach-metrics">
        <div class="metric-box ${tempStatusClass}">
          <span class="metric-label">
            <svg class="clock-icon" style="color:var(--accent-cyan);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>
            Water Temp ${tempStaleBadge}
          </span>
          ${tempHtml}
          <span class="metric-update">${tempUpdateText}</span>
        </div>
        <div class="metric-box ${ecoliStatusClass}">
          <span class="metric-label">
            🔬 E. Coli Count
          </span>
          ${ecoliHtml}
          <span class="metric-update">${ecoliUpdateText}</span>
        </div>
        <div class="metric-box ${waveStatusClass}">
          <span class="metric-label">
            🌊 Wave Height ${waveStaleBadge}
          </span>
          ${waveHtml}
          <span class="metric-update">${waveUpdateText}</span>
        </div>
      </div>
    `;

    panel.appendChild(card);
  });
}

function formatBeachDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBeachTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Initialize Beach conditions collapsible panel toggles
 */
function initBeachCollapse() {
  const toggleBtn = document.getElementById('toggle-beach-btn');
  const container = document.getElementById('beach-section-container');
  if (!toggleBtn || !container) return;

  // Load state from local storage - default to true (collapsed) if not set
  const storedCollapsed = localStorage.getItem('beach-collapsed');
  const isCollapsed = storedCollapsed === null ? true : (storedCollapsed === 'true');
  
  if (isCollapsed) {
    container.classList.add('collapsed');
    toggleBtn.textContent = 'Show';
    toggleBtn.classList.remove('active');
  } else {
    container.classList.remove('collapsed');
    toggleBtn.textContent = 'Hide';
    toggleBtn.classList.add('active');
  }

  toggleBtn.addEventListener('click', () => {
    const collapsed = container.classList.contains('collapsed');
    if (collapsed) {
      container.classList.remove('collapsed');
      toggleBtn.textContent = 'Hide';
      toggleBtn.classList.add('active');
      localStorage.setItem('beach-collapsed', 'false');
    } else {
      container.classList.add('collapsed');
      toggleBtn.textContent = 'Show';
      toggleBtn.classList.remove('active');
      localStorage.setItem('beach-collapsed', 'true');
    }
  });
}
