const THREE_MODULE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const state = {
  three: null,
  scene: null,
  camera: null,
  renderer: null,
  root: null,
  grid: null,
  raycaster: null,
  pointer: null,
  turtleMeshes: [],
  selectedTurtleIds: new Set(),
  initialized: false,
  fallbackReason: null,
  drag: { active: false, x: 0, y: 0 },
  rotation: { x: -0.42, y: 0.72 },
  zoom: 18
};

const blockPalette = {
  air: 0xbfdde7,
  solid: 0x7f8992,
  liquid: 0x1f7fa3,
  entity: 0xff6a2a,
  turtle: 0xff5a1f,
  unknown: 0xc9d1d4
};

function $(selector) {
  return document.querySelector(selector);
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

function isPositioned(turtle) {
  return Array.isArray(turtle.position) && turtle.position.length === 3 && turtle.position.every(Number.isFinite);
}

function turtlePosition(turtle, fallbackIndex = 0) {
  if (isPositioned(turtle)) {
    return { x: turtle.position[0], y: turtle.position[1], z: turtle.position[2], synthetic: false };
  }
  return { x: fallbackIndex * 2, y: 0, z: 0, synthetic: true };
}

function cellColor(cell) {
  if (cell.blockName?.includes('lava')) {
    return 0xd63f26;
  }
  if (cell.blockName?.includes('water')) {
    return 0x1682b0;
  }
  if (cell.blockName?.includes('ore')) {
    return 0xf2b134;
  }
  if (cell.blockName?.includes('deepslate')) {
    return 0x4b5662;
  }
  if (cell.blockName?.includes('dirt') || cell.blockName?.includes('grass')) {
    return 0x6f8f5f;
  }
  return blockPalette[cell.occupancy] ?? blockPalette.unknown;
}

function normalizePoint(point, center) {
  return {
    x: point.x - center.x,
    y: point.y - center.y,
    z: point.z - center.z
  };
}

function selectedTurtles(turtles) {
  if (state.selectedTurtleIds.size === 0) {
    turtles.forEach((turtle) => state.selectedTurtleIds.add(turtle.turtleId));
  }
  return turtles.filter((turtle) => state.selectedTurtleIds.has(turtle.turtleId));
}

function nearbyTurtles(turtles, selected, radius) {
  const positionedSelected = selected.filter(isPositioned);
  if (positionedSelected.length === 0) {
    return selected;
  }
  return turtles.filter((turtle) => {
    if (state.selectedTurtleIds.has(turtle.turtleId)) {
      return true;
    }
    if (!isPositioned(turtle)) {
      return false;
    }
    return positionedSelected.some((origin) => {
      const dx = turtle.position[0] - origin.position[0];
      const dy = turtle.position[1] - origin.position[1];
      const dz = turtle.position[2] - origin.position[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius;
    });
  });
}

function renderFilters(turtles, onChange) {
  const host = $('#mapTurtleFilters');
  if (!host) {
    return;
  }
  host.innerHTML = turtles.map((turtle) => {
    const checked = state.selectedTurtleIds.has(turtle.turtleId) || state.selectedTurtleIds.size === 0;
    const position = isPositioned(turtle) ? turtle.position.join(', ') : 'position unknown';
    return `
      <label class="map-filter-item">
        <input type="checkbox" value="${escapeHtml(turtle.turtleId)}" ${checked ? 'checked' : ''}>
        <span>
          <strong>${escapeHtml(turtle.turtleId)}</strong>
          <small>${escapeHtml(turtle.status ?? 'unknown')} · ${escapeHtml(position)}</small>
        </span>
      </label>
    `;
  }).join('') || '<p class="empty-state">No turtles have reported yet.</p>';

  host.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) {
        state.selectedTurtleIds.add(input.value);
      } else {
        state.selectedTurtleIds.delete(input.value);
      }
      onChange();
    });
  });
}

async function initThree(canvas) {
  if (state.initialized) {
    return;
  }
  if (state.fallbackReason) {
    throw state.fallbackReason;
  }
  const THREE = await import(THREE_MODULE_URL);
  state.three = THREE;
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0xeef2f3);
  state.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 5000);
  try {
    state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (error) {
    state.fallbackReason = error;
    throw error;
  }
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.root = new THREE.Group();
  state.root.rotation.x = state.rotation.x;
  state.root.rotation.y = state.rotation.y;
  state.scene.add(state.root);
  state.raycaster = new THREE.Raycaster();
  state.pointer = new THREE.Vector2();

  const ambient = new THREE.AmbientLight(0xffffff, 0.66);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(8, 14, 8);
  state.scene.add(ambient, key);

  const grid = new THREE.GridHelper(32, 32, 0x1f5eff, 0xcbd5da);
  grid.position.y = -0.51;
  state.grid = grid;
  state.root.add(grid);

  canvas.addEventListener('pointerdown', (event) => {
    state.drag = { active: true, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', () => {
    state.drag.active = false;
  });
  canvas.addEventListener('pointerleave', () => {
    state.drag.active = false;
    hideTooltip();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (state.drag.active) {
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      state.root.rotation.y += dx * 0.008;
      state.root.rotation.x += dy * 0.006;
      state.root.rotation.x = Math.max(-1.2, Math.min(0.2, state.root.rotation.x));
      state.drag.x = event.clientX;
      state.drag.y = event.clientY;
      return;
    }
    updateHover(event, canvas);
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    state.zoom = Math.max(4, Math.min(160, state.zoom + event.deltaY * 0.02));
    state.camera.position.set(0, state.zoom * 0.56, state.zoom);
  }, { passive: false });

  window.addEventListener('resize', resize);
  state.initialized = true;
  resize();
  animate();
}

function resize() {
  const canvas = $('#worldMapCanvas');
  if (!state.renderer || !canvas) {
    return;
  }
  const box = canvas.getBoundingClientRect();
  state.renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
  state.camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
  state.camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  if (state.renderer && state.scene && state.camera) {
    state.renderer.render(state.scene, state.camera);
  }
}

function clearScene() {
  for (const child of [...state.root.children]) {
    if (child === state.grid) {
      continue;
    }
    state.root.remove(child);
    child.traverse?.((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) {
        node.material.forEach((material) => material.dispose?.());
      } else {
        node.material?.dispose?.();
      }
    });
  }
  state.turtleMeshes = [];
}

function gridOffsetFor(centerCoordinate) {
  return Math.round(centerCoordinate) - centerCoordinate;
}

function alignGrid(center, turtles, selectedIds) {
  if (!state.grid) {
    return;
  }
  const primary = turtles.find((turtle) => selectedIds.has(turtle.turtleId) && isPositioned(turtle))
    ?? turtles.find(isPositioned);
  const anchorY = primary ? primary.position[1] : Math.round(center.y);
  state.grid.position.set(
    gridOffsetFor(center.x),
    anchorY - center.y - 0.5,
    gridOffsetFor(center.z)
  );
}

function makeCell(cell, center) {
  const THREE = state.three;
  const point = normalizePoint({ x: cell.x, y: cell.y, z: cell.z }, center);
  const geometry = new THREE.BoxGeometry(0.92, 0.92, 0.92);
  const isAir = cell.occupancy === 'air';
  const material = new THREE.MeshStandardMaterial({
    color: cellColor(cell),
    transparent: isAir,
    opacity: isAir ? 0.18 : 0.86,
    wireframe: isAir
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(point.x, point.y, point.z);
  mesh.userData = { type: 'cell', cell };
  return mesh;
}

function makeTurtle(turtle, center, index, selected) {
  const THREE = state.three;
  const raw = turtlePosition(turtle, index);
  const point = normalizePoint(raw, center);
  const group = new THREE.Group();
  group.position.set(point.x, point.y, point.z);
  group.userData = { type: 'turtle', turtle };
  const facing = turtle.facing ?? 'north';
  group.rotation.y = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 }[facing] ?? 0;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.92, 0.92),
    new THREE.MeshStandardMaterial({
      color: selected ? 0xff5a1f : 0x1f5eff,
      emissive: selected ? 0x3a1000 : 0x06184d,
      roughness: 0.55,
      transparent: !selected,
      opacity: selected ? 1 : 0.58
    })
  );
  body.userData = group.userData;
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.48, 0.018),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: selected ? 0x221100 : 0x050505,
      roughness: 0.48
    })
  );
  face.position.z = -0.47;
  face.userData = group.userData;
  group.add(face);

  state.turtleMeshes.push(body, face);
  return group;
}

function sceneCenter(cells, turtles) {
  const points = [
    ...cells.map((cell) => ({ x: cell.x, y: cell.y, z: cell.z })),
    ...turtles.map((turtle, index) => turtlePosition(turtle, index))
  ];
  if (points.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length
  };
}

function fitCamera(cells, turtles, center) {
  const points = [
    ...cells.map((cell) => normalizePoint({ x: cell.x, y: cell.y, z: cell.z }, center)),
    ...turtles.map((turtle, index) => normalizePoint(turtlePosition(turtle, index), center))
  ];
  const maxDistance = points.reduce((max, point) => Math.max(max, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)), 6);
  state.zoom = Math.max(10, Math.min(160, maxDistance * 2.1 + 8));
  state.camera.position.set(0, state.zoom * 0.56, state.zoom);
  state.camera.lookAt(0, 0, 0);
}

function renderScene({ cells, turtles, selectedIds }) {
  clearScene();
  const visibleCells = cells.filter((cell) => cell.occupancy !== 'unknown');
  const center = sceneCenter(visibleCells, turtles);
  alignGrid(center, turtles, selectedIds);
  visibleCells.forEach((cell) => state.root.add(makeCell(cell, center)));
  turtles.forEach((turtle, index) => {
    state.root.add(makeTurtle(turtle, center, index, selectedIds.has(turtle.turtleId)));
  });
  fitCamera(visibleCells, turtles, center);
  resize();
}

function renderFallback({ cells, turtles, selectedIds }) {
  const canvas = $('#worldMapCanvas');
  const context = canvas?.getContext?.('2d');
  if (!canvas || !context) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = '#eef2f3';
  context.fillRect(0, 0, rect.width, rect.height);

  const visibleCells = cells.filter((cell) => cell.occupancy !== 'unknown');
  const center = sceneCenter(visibleCells, turtles);
  const scale = 18;
  const originX = rect.width * 0.55;
  const originY = rect.height * 0.48;
  const project = (point) => {
    const normalized = normalizePoint(point, center);
    return {
      x: originX + (normalized.x - normalized.z) * scale,
      y: originY + (normalized.x + normalized.z) * scale * 0.48 - normalized.y * scale
    };
  };

  context.strokeStyle = 'rgba(31, 94, 255, 0.18)';
  context.lineWidth = 1;
  const minGridX = Math.floor(center.x) - 12;
  const maxGridX = Math.floor(center.x) + 12;
  const minGridZ = Math.floor(center.z) - 12;
  const maxGridZ = Math.floor(center.z) + 12;
  for (let line = minGridX; line <= maxGridX; line += 1) {
    let a = project({ x: line, y: center.y, z: minGridZ });
    let b = project({ x: line, y: center.y, z: maxGridZ });
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  for (let line = minGridZ; line <= maxGridZ; line += 1) {
    const a = project({ x: minGridX, y: center.y, z: line });
    const b = project({ x: maxGridX, y: center.y, z: line });
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }

  visibleCells.slice(0, 900).forEach((cell) => {
    const point = project({ x: cell.x, y: cell.y, z: cell.z });
    context.fillStyle = `#${cellColor(cell).toString(16).padStart(6, '0')}`;
    context.globalAlpha = cell.occupancy === 'air' ? 0.28 : 0.82;
    context.fillRect(point.x - 5, point.y - 5, 10, 10);
    context.globalAlpha = 1;
  });

  turtles.forEach((turtle, index) => {
    const raw = turtlePosition(turtle, index);
    const point = project(raw);
    const selected = selectedIds.has(turtle.turtleId);
    context.fillStyle = selected ? '#ff5a1f' : '#1f5eff';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, selected ? 8 : 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#0f171c';
    context.font = '12px sans-serif';
    context.fillText(turtle.turtleId, point.x + 10, point.y - 10);
  });

  context.fillStyle = 'rgba(15, 23, 28, 0.62)';
  context.font = '13px sans-serif';
  context.fillText('2D fallback: WebGL unavailable in this browser session', 18, rect.height - 18);
}

function showTooltip(event, turtle) {
  const tooltip = $('#mapTooltip');
  if (!tooltip) {
    return;
  }
  const position = isPositioned(turtle) ? turtle.position.join(', ') : 'unknown';
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
  tooltip.innerHTML = `
    <strong>${escapeHtml(turtle.turtleId)}</strong>
    <span>${escapeHtml(turtle.status ?? 'unknown')} · fuel ${escapeHtml(turtle.fuel ?? 'n/a')}</span>
    <span>pos ${escapeHtml(position)} · facing ${escapeHtml(turtle.facing ?? 'n/a')}</span>
    <span>runtime ${escapeHtml(turtle.runtimeVersion ?? 'n/a')}</span>
    <span>last scan ${escapeHtml(turtle.lastScanAt ?? 'not scanned')}</span>
  `;
}

function hideTooltip() {
  const tooltip = $('#mapTooltip');
  if (tooltip) {
    tooltip.hidden = true;
  }
}

function updateHover(event, canvas) {
  if (!state.raycaster || !state.camera || state.turtleMeshes.length === 0) {
    hideTooltip();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const hit = state.raycaster.intersectObjects(state.turtleMeshes, false)[0];
  if (hit?.object?.userData?.turtle) {
    showTooltip(event, hit.object.userData.turtle);
  } else {
    hideTooltip();
  }
}

async function fetchWorldForTurtles(api, turtles, radius) {
  const positioned = turtles.filter(isPositioned);
  if (positioned.length === 0) {
    return [];
  }
  const byDimension = new Map();
  positioned.forEach((turtle) => {
    const dimension = turtle.dimension ?? 'overworld';
    if (!byDimension.has(dimension)) {
      byDimension.set(dimension, []);
    }
    byDimension.get(dimension).push(turtle);
  });

  const results = await Promise.all([...byDimension.entries()].map(async ([dimension, group]) => {
    const xs = group.map((turtle) => turtle.position[0]);
    const ys = group.map((turtle) => turtle.position[1]);
    const zs = group.map((turtle) => turtle.position[2]);
    const params = new URLSearchParams({
      dimension,
      minX: Math.floor(Math.min(...xs) - radius),
      maxX: Math.ceil(Math.max(...xs) + radius),
      minY: Math.floor(Math.min(...ys) - Math.min(radius, 8)),
      maxY: Math.ceil(Math.max(...ys) + Math.min(radius, 8)),
      minZ: Math.floor(Math.min(...zs) - radius),
      maxZ: Math.ceil(Math.max(...zs) + radius)
    });
    const payload = await api(`/api/world?${params.toString()}`);
    return payload.cells;
  }));
  return results.flat();
}

export function initWorldMap({ api, onStatus } = {}) {
  const canvas = $('#worldMapCanvas');
  if (!canvas) {
    return { activate() {}, refresh() {} };
  }

  async function refresh() {
    const status = $('#mapStatus');
    try {
      status.textContent = 'loading map';
      const fleet = await api('/api/fleet');
      const turtles = fleet.turtles ?? [];
      renderFilters(turtles, refresh);
      const radius = Number($('#mapRadius')?.value ?? 10);
      const selected = selectedTurtles(turtles);
      const visibleTurtles = nearbyTurtles(turtles, selected, radius);
      const cells = await fetchWorldForTurtles(api, selected, radius);
      try {
        await initThree(canvas);
        renderScene({ cells, turtles: visibleTurtles, selectedIds: state.selectedTurtleIds });
        status.textContent = `${cells.filter((cell) => cell.occupancy !== 'unknown').length} known cells · ${visibleTurtles.length} turtles`;
      } catch (error) {
        renderFallback({ cells, turtles: visibleTurtles, selectedIds: state.selectedTurtleIds });
        status.textContent = `2D fallback · ${cells.filter((cell) => cell.occupancy !== 'unknown').length} known cells · ${visibleTurtles.length} turtles`;
      }
      onStatus?.('map synced', new Date().toLocaleTimeString());
    } catch (error) {
      status.textContent = `map unavailable: ${error.message}`;
      onStatus?.('map error', error.message);
    }
  }

  $('#mapRefreshButton')?.addEventListener('click', refresh);
  $('#mapRadius')?.addEventListener('change', refresh);

  return {
    activate() {
      refresh();
    },
    refresh
  };
}
