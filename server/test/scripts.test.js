import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScriptRegistry, hashBundle } from '../src/scripts.js';

function packageFixture(overrides = {}) {
  const files = overrides.files ?? {
    'main.lua': 'return function(rt) rt.inspect() end'
  };
  return {
    manifest: {
      name: 'inspect_once',
      version: '1.0.0',
      entrypoint: 'main.lua',
      permissions: ['turtle.inspect'],
      limits: { max_runtime_s: 30 },
      sha256: hashBundle(files),
      ...overrides.manifest
    },
    files
  };
}

test('validates and deploys script package', () => {
  const registry = new ScriptRegistry();
  const result = registry.deploy(packageFixture());

  assert.equal(result.ok, true);
  assert.equal(result.script.name, 'inspect_once');
  assert.equal(result.script.approved, false);
});

test('rejects hash mismatches', () => {
  const registry = new ScriptRegistry();
  const result = registry.deploy(packageFixture({ manifest: { sha256: 'bad' } }));

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'hash_mismatch');
});

test('requires approval and permissions before run', () => {
  const registry = new ScriptRegistry();
  const deployed = registry.deploy(packageFixture());

  assert.equal(registry.canRun(deployed.script.scriptId, ['turtle.inspect']).reason, 'script_not_approved');
  registry.approve(deployed.script.scriptId, 'operator-a');
  assert.equal(registry.canRun(deployed.script.scriptId, ['turtle.inspect']).ok, true);
  assert.equal(registry.canRun(deployed.script.scriptId, ['turtle.dig']).reason, 'permission_denied');
});

test('revoked scripts cannot run', () => {
  const registry = new ScriptRegistry();
  const deployed = registry.deploy(packageFixture());
  registry.approve(deployed.script.scriptId, 'operator-a');
  registry.revoke(deployed.script.scriptId, 'operator-a');

  assert.equal(registry.canRun(deployed.script.scriptId, ['turtle.inspect']).reason, 'script_revoked');
});

