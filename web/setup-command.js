const DEFAULT_SETUP = {
  pairingToken: 'dev-pairing-token',
  installPath: '/turtle/install.lua',
  suggestedTurtleId: 'fleet-dev-001'
};

function normalizeServerUrl(value) {
  const raw = String(value || '').trim();
  const withScheme = /^https?:\/\//.test(raw)
    ? raw
    : `${window.location.protocol === 'https:' ? 'https' : 'http'}://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

function defaultHost() {
  return window.location.host || '127.0.0.1:8787';
}

function buildCommand({ host, installPath, pairingToken, turtleId }) {
  const serverUrl = normalizeServerUrl(host);
  return `wget run ${serverUrl}${installPath} ${serverUrl} ${pairingToken} ${turtleId}`;
}

async function loadSetup() {
  try {
    const response = await fetch('/api/setup');
    if (!response.ok) {
      throw new Error(`setup request failed: ${response.status}`);
    }
    return { ...DEFAULT_SETUP, ...(await response.json()) };
  } catch {
    return DEFAULT_SETUP;
  }
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function wireContainer(container, setup, onStatus) {
  const hostInput = container.querySelector('[data-install-host]');
  const turtleInput = container.querySelector('[data-install-turtle-id]');
  const commandOutput = container.querySelector('[data-install-command]');
  const gatewayOutput = container.querySelector('[data-install-gateway]');
  const copyButton = container.querySelector('[data-copy-install-command]');

  if (!hostInput || !turtleInput || !commandOutput) {
    return;
  }

  if (!hostInput.value) {
    hostInput.value = defaultHost();
  }
  if (!turtleInput.value) {
    turtleInput.value = setup.suggestedTurtleId;
  }

  const render = () => {
    const command = buildCommand({
      host: hostInput.value,
      installPath: setup.installPath,
      pairingToken: setup.pairingToken,
      turtleId: turtleInput.value || setup.suggestedTurtleId
    });
    commandOutput.textContent = command;
    if (gatewayOutput) {
      gatewayOutput.textContent = `${normalizeServerUrl(hostInput.value).replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')}/turtle/ws`;
    }
  };

  hostInput.addEventListener('input', render);
  turtleInput.addEventListener('input', render);
  copyButton?.addEventListener('click', async () => {
    try {
      await copyText(commandOutput.textContent);
      onStatus?.('copied', new Date().toLocaleTimeString());
    } catch (error) {
      onStatus?.('copy failed', error.message);
    }
  });

  render();
}

export async function initSetupCommand({ onStatus } = {}) {
  const containers = Array.from(document.querySelectorAll('[data-setup-command]'));
  if (containers.length === 0) {
    return;
  }
  const setup = await loadSetup();
  containers.forEach((container) => wireContainer(container, setup, onStatus));
}
