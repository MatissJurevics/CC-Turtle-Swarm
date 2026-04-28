import { initSetupCommand } from '/setup-command.js';

const state = {
  fleet: { turtles: [], jobs: [], diagnostics: [], commands: [] },
  selectedTurtleId: null,
  lease: null,
  toastTimer: null
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
      <td>${turtle.fuel ?? 'n/a'}</td>
      <td>${turtle.runtimeVersion ?? 'n/a'}</td>
    </tr>
  `).join('') || `
    <tr>
      <td colspan="4">
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

function renderDetail() {
  const turtle = state.fleet.turtles.find((item) => item.turtleId === state.selectedTurtleId);
  $('#selectedTurtleLabel').textContent = turtle ? `${turtle.turtleId} ${turtle.status}` : 'none selected';
  renderInventory(turtle);
  $('#leaseStatus').textContent = state.lease ? `Lease ${state.lease.leaseId}` : 'No active lease';
  const hasTurtle = Boolean(turtle);
  const hasLease = Boolean(state.lease);
  $('#leaseButton').disabled = !hasTurtle;
  $('#clearQueueButton').disabled = !hasTurtle;
  $$('[data-action]').forEach((button) => {
    button.disabled = !hasTurtle || !hasLease;
  });
  $('#actionStatus').textContent = hasTurtle
    ? hasLease
      ? 'Lease active. Keep actions bounded.'
      : 'Acquire a lease before sending actions.'
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
    setNotice(`${action} queued.`);
    await refresh();
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
  const row = event.target.closest('[data-turtle-id]');
  if (row) {
    state.selectedTurtleId = row.dataset.turtleId;
    state.lease = null;
    renderFleet();
    renderDetail();
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) {
    sendAction(action);
  }
});

$('#refreshButton').addEventListener('click', refresh);
$('#leaseButton').addEventListener('click', acquireLease);
$('#clearQueueButton').addEventListener('click', clearQueue);
$('#jobForm').addEventListener('submit', createJob);
$('#worldForm').addEventListener('submit', queryWorld);

initSetupCommand({
  onStatus(label, detail) {
    $('#healthStatus').textContent = label;
    $('#updatedAt').textContent = detail;
  }
});
refresh();
setInterval(refresh, 5000);
