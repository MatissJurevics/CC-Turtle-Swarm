import { initSetupCommand } from '/setup-command.js';
import { initWorldMap } from '/map-view.js';

const state = {
  fleet: { turtles: [], jobs: [], diagnostics: [], commands: [] },
  turtleLogs: [],
  logsLoading: false,
  selectedTurtleId: null,
  lease: null,
  toastTimer: null,
  activeTab: 'operations',
  map: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.reason ?? payload.message ?? `Request failed: ${response.status}`);
  }
  return payload;
}

function statusClass(status) {
  return `status-${status ?? 'unknown'}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPosition(turtle) {
  if (!Array.isArray(turtle?.position) || turtle.position.length !== 3) {
    return 'unknown';
  }
  return turtle.position.map(formatCoordinate).join(', ');
}

function formatPose(turtle) {
  return `${formatPosition(turtle)} · ${turtle?.facing ?? 'unknown'}`;
}

function formatConfidence(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${Math.round(value * 100)}%`;
}

function formatUpdated(value) {
  if (!value) {
    return 'never';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString();
}

function compactJson(value) {
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function logTime(event) {
  const ts = event.payload?.ts;
  if (Number.isFinite(ts)) {
    return new Date(ts).toLocaleTimeString();
  }
  return formatUpdated(event.createdAt);
}

function logLevel(event) {
  if (event.type === 'event.turtle.log') {
    return event.payload?.level ?? 'info';
  }
  if (event.payload?.success === false || event.payload?.error) {
    return 'error';
  }
  return 'info';
}

function logSummary(event) {
  const payload = event.payload ?? {};
  if (event.type === 'event.turtle.log') {
    const component = payload.component ? `${payload.component}: ` : '';
    return `${component}${payload.message ?? 'log'}`;
  }
  if (event.type === 'event.action.started') {
    return `action started: ${payload.action ?? 'unknown'}`;
  }
  if (event.type === 'event.action.completed') {
    const action = payload.action ?? 'unknown';
    return payload.success === false ? `action failed: ${action}` : `action completed: ${action}`;
  }
  if (event.type === 'event.command.completed') {
    const command = payload.command?.body?.action ?? payload.result?.body?.action ?? 'unknown';
    return payload.result?.success === false ? `command failed: ${command}` : `command completed: ${command}`;
  }
  if (event.type === 'event.world.scanned') {
    return `world scanned: ${payload.observations?.length ?? 0} observations`;
  }
  if (event.type === 'event.turtle.booted') {
    return 'runtime booted';
  }
  if (event.type === 'event.turtle.connected') {
    return 'gateway connected';
  }
  if (event.type === 'event.turtle.disconnected') {
    return 'gateway disconnected';
  }
  return event.type;
}

function logDetails(event) {
  if (event.type === 'event.turtle.log') {
    return compactJson(event.payload?.fields);
  }
  return compactJson(event.payload);
}

function renderMetrics() {
  const turtles = state.fleet.turtles;
  const online = turtles.filter((turtle) => turtle.status === 'online').length;
  const busy = turtles.filter((turtle) => turtle.status === 'busy').length;
  const warnings = turtles.filter((turtle) => turtle.lastError || (turtle.fuel ?? 9999) < 20).length;
  $('#fleetMetrics').innerHTML = [
    ['Online', online],
    ['Busy', busy],
    ['Warnings', warnings],
    ['Jobs', state.fleet.jobs.length]
  ].map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

function renderFleet() {
  renderMetrics();
  $('#turtleRows').innerHTML = state.fleet.turtles.map((turtle) => `
    <tr data-turtle-id="${turtle.turtleId}" data-selected="${turtle.turtleId === state.selectedTurtleId}">
      <td>${turtle.turtleId}</td>
      <td class="${statusClass(turtle.status)}">${turtle.status ?? 'unknown'}</td>
      <td>${formatPose(turtle)}</td>
      <td>${turtle.fuel ?? 'n/a'}</td>
      <td>${turtle.runtimeVersion ?? 'n/a'}</td>
    </tr>
  `).join('') || `
    <tr>
      <td colspan="5">
        <div class="empty-state">No turtles online. Use <a href="/">Setup</a>, then reboot the turtle.</div>
      </td>
    </tr>
  `;
}

function renderInventory(turtle) {
  const inventory = turtle?.inventory ?? {};
  const slots = [];
  for (let slot = 1; slot <= 16; slot += 1) {
    const item = inventory[slot] ?? inventory[String(slot)];
    slots.push(`
      <div class="slot">
        <strong>${slot}</strong>
        <span>${item?.name ?? 'empty'}</span>
        <span>${item?.count ?? ''}</span>
      </div>
    `);
  }
  $('#inventoryGrid').innerHTML = slots.join('');
}

function renderPose(turtle) {
  const rows = turtle ? [
    ['Position', formatPosition(turtle)],
    ['Facing', turtle.facing ?? 'unknown'],
    ['Dimension', turtle.dimension ?? 'overworld'],
    ['Confidence', formatConfidence(turtle.positionConfidence)],
    ['Command', turtle.activeCommandId ?? 'idle'],
    ['Updated', formatUpdated(turtle.updatedAt)]
  ] : [
    ['Position', 'unknown'],
    ['Facing', 'unknown'],
    ['Dimension', 'unknown'],
    ['Confidence', 'n/a'],
    ['Command', 'idle'],
    ['Updated', 'never']
  ];

  $('#poseGrid').innerHTML = rows.map(([label, value]) => `
    <div>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>
  `).join('');
}

function renderLogs() {
  const host = $('#turtleLogList');
  if (!host) {
    return;
  }
  if (!state.selectedTurtleId) {
    host.innerHTML = '<p class="empty-state">Select a turtle to view runtime logs.</p>';
    return;
  }
  if (state.logsLoading && state.turtleLogs.length === 0) {
    host.innerHTML = '<p class="empty-state">Loading turtle logs...</p>';
    return;
  }

  const events = state.turtleLogs
    .filter((event) => event.type !== 'event.turtle.heartbeat')
    .slice(-40)
    .reverse();

  host.innerHTML = events.map((event) => {
    const details = logDetails(event);
    return `
      <article class="turtle-log-entry" data-level="${escapeHtml(logLevel(event))}">
        <div>
          <strong>${escapeHtml(logSummary(event))}</strong>
          <small>${escapeHtml(logTime(event))} · ${escapeHtml(event.type)}</small>
        </div>
        ${details ? `<pre>${escapeHtml(details)}</pre>` : ''}
      </article>
    `;
  }).join('') || '<p class="empty-state">No runtime log events yet. Reboot the turtle or run a manual action.</p>';
}

function renderDetail() {
  const turtle = state.fleet.turtles.find((item) => item.turtleId === state.selectedTurtleId);
  $('#selectedTurtleLabel').textContent = turtle ? `${turtle.turtleId} ${turtle.status} · ${formatPose(turtle)}` : 'none selected';
  renderInventory(turtle);
  renderPose(turtle);
  renderLogs();
  $('#leaseStatus').textContent = state.lease ? `Lease ${state.lease.leaseId}` : 'No active lease';
  const hasTurtle = Boolean(turtle);
  const hasLease = Boolean(state.lease);
  $('#leaseButton').disabled = !hasTurtle;
  $('#clearQueueButton').disabled = !hasTurtle;
  $('#refreshLogsButton').disabled = !hasTurtle;
  $$('[data-action]').forEach((button) => {
    button.disabled = !hasTurtle || !hasLease;
  });
  $('#actionStatus').textContent = hasTurtle
    ? hasLease
      ? `Lease active. Pose ${formatPose(turtle)}.`
      : `Acquire a lease before sending actions. Pose ${formatPose(turtle)}.`
    : 'Select an online turtle before sending actions.';
}

function renderJobs() {
  $('#jobList').innerHTML = state.fleet.jobs.map((job) => `
    <div class="row">
      <div>
        <strong>${job.goalText ?? job.jobId}</strong>
        <small>${job.jobId}</small>
      </div>
      <span class="tag ${statusClass(job.status)}">${job.status}</span>
    </div>
  `).join('') || '<p class="empty-state">No jobs yet. Create a survey goal after the first heartbeat succeeds.</p>';
}

function renderScripts() {
  api('/api/scripts').then((payload) => {
    $('#scriptList').innerHTML = payload.scripts.map((script) => `
      <div class="row">
        <div>
          <strong>${script.name}@${script.version}</strong>
          <small>${script.scriptId}</small>
        </div>
        <span class="tag">${script.approved ? 'approved' : 'draft'}</span>
      </div>
    `).join('') || '<p class="empty-state">No scripts deployed. Validate and deploy scripts only after manual inspect works.</p>';
  });
}

function renderDiagnostics() {
  $('#diagnosticsList').innerHTML = state.fleet.diagnostics.map((item) => `
    <div class="row">
      <div>
        <strong>${item.error?.code ?? item.type}</strong>
        <small>${item.turtleId ?? item.jobId ?? item.eventId}</small>
      </div>
      <span class="tag">error</span>
    </div>
  `).join('') || '<p class="empty-state">No recent errors. Failed commands and script crashes will appear here.</p>';
}

function setNotice(message) {
  $('#actionStatus').textContent = message;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(renderDetail, 2400);
}

function setStatus(label, detail) {
  $('#healthStatus').textContent = label;
  $('#updatedAt').textContent = detail;
}

function setConsoleTab(tabName) {
  state.activeTab = tabName;
  $$('[data-console-tab]').forEach((button) => {
    const active = button.dataset.consoleTab === tabName;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('[data-console-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.consolePanel !== tabName;
  });
  if (tabName === 'map') {
    window.history.replaceState(null, '', '#map');
    state.map?.activate();
  } else if (window.location.hash === '#map') {
    window.history.replaceState(null, '', window.location.pathname);
  }
}

async function refreshLogs() {
  if (!state.selectedTurtleId) {
    state.turtleLogs = [];
    renderLogs();
    return;
  }
  const turtleId = state.selectedTurtleId;
  state.logsLoading = true;
  renderLogs();
  try {
    const payload = await api(`/api/turtles/${encodeURIComponent(turtleId)}/logs?limit=120`);
    if (state.selectedTurtleId === turtleId) {
      state.turtleLogs = payload.events ?? [];
    }
  } catch (error) {
    if (state.selectedTurtleId === turtleId) {
      state.turtleLogs = [{
        type: 'event.turtle.log',
        createdAt: new Date().toISOString(),
        payload: {
          level: 'error',
          component: 'console',
          message: `Log fetch failed: ${error.message}`,
          fields: {}
        }
      }];
    }
  } finally {
    if (state.selectedTurtleId === turtleId) {
      state.logsLoading = false;
      renderLogs();
    }
  }
}

async function refresh() {
  try {
    $('#healthStatus').textContent = 'syncing';
    state.fleet = await api('/api/fleet');
    if (!state.selectedTurtleId && state.fleet.turtles[0]) {
      state.selectedTurtleId = state.fleet.turtles[0].turtleId;
    }
    renderFleet();
    renderDetail();
    renderJobs();
    renderScripts();
    renderDiagnostics();
    await refreshLogs();
    $('#healthStatus').textContent = 'online';
    $('#updatedAt').textContent = new Date().toLocaleTimeString();
  } catch (error) {
    $('#healthStatus').textContent = 'offline';
    $('#updatedAt').textContent = error.message;
    setNotice(`Sync failed: ${error.message}`);
  }
}

async function acquireLease() {
  if (!state.selectedTurtleId) {
    return;
  }
  const holder = $('#holderInput').value || 'operator';
  try {
    const payload = await api('/api/leases', {
      method: 'POST',
      body: {
        type: 'turtle_control',
        resourceId: state.selectedTurtleId,
        holder,
        ttlMs: 60000
      }
    });
    if (payload.ok) {
      state.lease = payload.lease;
      setNotice('Lease acquired for 60 seconds.');
    }
  } catch (error) {
    setNotice(`Lease failed: ${error.message}`);
  }
  renderDetail();
}

async function sendAction(action) {
  if (!state.selectedTurtleId || !state.lease) {
    setNotice('Select a turtle and acquire a lease first.');
    return;
  }
  try {
    await api(`/api/turtles/${state.selectedTurtleId}/actions`, {
      method: 'POST',
      body: {
        action,
        lease: state.lease,
        requestedBy: $('#holderInput').value || 'operator',
        idempotencyKey: `${state.selectedTurtleId}-${action}-${Date.now()}`
      }
    });
    await refresh();
    setNotice(`${action} queued. Waiting for turtle telemetry.`);
    window.setTimeout(async () => {
      await refresh();
      if (state.activeTab === 'map') {
        state.map?.refresh();
      }
    }, 2800);
    if (state.activeTab === 'map') {
      state.map?.refresh();
    }
  } catch (error) {
    setNotice(`Action failed: ${error.message}`);
  }
}

async function clearQueue() {
  if (!state.selectedTurtleId) {
    setNotice('Select a turtle before clearing its queue.');
    return;
  }
  try {
    const result = await api(`/api/turtles/${state.selectedTurtleId}/queue-clear`, {
      method: 'POST',
      body: { reason: 'operator_clear' }
    });
    setNotice(`Cleared ${result.cleared} queued commands.`);
    await refresh();
  } catch (error) {
    setNotice(`Clear failed: ${error.message}`);
  }
}

async function createJob(event) {
  event.preventDefault();
  const goalText = $('#goalInput').value.trim();
  if (!goalText) {
    return;
  }
  try {
    await api('/api/jobs', {
      method: 'POST',
      body: { goalText, createdBy: $('#holderInput').value || 'operator' }
    });
    $('#goalInput').value = '';
    setNotice('Job created.');
    await refresh();
  } catch (error) {
    setNotice(`Job failed: ${error.message}`);
  }
}

async function queryWorld(event) {
  event.preventDefault();
  const params = new URLSearchParams({
    minX: $('#minX').value,
    maxX: $('#maxX').value,
    minY: $('#minY').value,
    maxY: $('#maxY').value,
    minZ: $('#minZ').value,
    maxZ: $('#maxZ').value
  });
  try {
    const payload = await api(`/api/world?${params.toString()}`);
    $('#worldCells').innerHTML = payload.cells.map((cell) => `
      <div class="cell" data-occupancy="${cell.occupancy}">
        <strong>${cell.x}, ${cell.y}, ${cell.z}</strong>
        <span>${cell.occupancy}</span>
        <small>${cell.blockName ?? 'unobserved'}</small>
      </div>
    `).join('');
  } catch (error) {
    $('#worldCells').innerHTML = `<p class="empty-state">World query failed: ${error.message}</p>`;
  }
}

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-console-tab]')?.dataset.consoleTab;
  if (tab) {
    setConsoleTab(tab);
    return;
  }
  const row = event.target.closest('[data-turtle-id]');
  if (row) {
    state.selectedTurtleId = row.dataset.turtleId;
    state.lease = null;
    state.turtleLogs = [];
    renderFleet();
    renderDetail();
    refreshLogs();
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) {
    sendAction(action);
  }
});

$('#refreshButton').addEventListener('click', refresh);
$('#leaseButton').addEventListener('click', acquireLease);
$('#clearQueueButton').addEventListener('click', clearQueue);
$('#refreshLogsButton').addEventListener('click', refreshLogs);
$('#jobForm').addEventListener('submit', createJob);
$('#worldForm').addEventListener('submit', queryWorld);

initSetupCommand({
  onStatus: setStatus
});
state.map = initWorldMap({ api, onStatus: setStatus });
refresh();
setConsoleTab(window.location.hash === '#map' ? 'map' : 'operations');
setInterval(refresh, 5000);
