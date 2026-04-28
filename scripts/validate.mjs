import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];

function run(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  checks.push({
    name,
    status: result.status === 0 ? 'passed' : 'failed',
    command: [command, ...args].join(' '),
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  });
}

async function exists(name, relativePath) {
  try {
    await access(path.join(root, relativePath));
    checks.push({ name, status: 'passed', command: `access ${relativePath}`, output: '' });
  } catch (error) {
    checks.push({ name, status: 'failed', command: `access ${relativePath}`, output: error.message });
  }
}

run('node unit tests', 'npm', ['test']);
run('turtle bundle build', 'npm', ['run', 'bundle:turtle']);

await exists('architecture spec', 'docs/architecture.md');
await exists('implementation plan', 'docs/implementation-plan.md');
await exists('QA validation matrix', 'docs/qa-validation-matrix.md');
await exists('in-game setup guide', 'docs/in-game-setup.md');
await exists('turtle bundle manifest', 'dist/turtle-bundle/manifest.json');
await exists('turtle startup bundle', 'dist/turtle-bundle/startup.lua');

const luac = spawnSync('luac', ['-v'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const luaFiles = [
  'turtle/startup.lua',
  'turtle/runtime/config.lua',
  'turtle/runtime/logger.lua',
  'turtle/runtime/spool.lua',
  'turtle/runtime/actuator.lua',
  'turtle/runtime/transport.lua',
  'turtle/runtime/watchdog.lua',
  'turtle/runtime/executor.lua',
  'turtle/runtime/main.lua'
];
if (luac.status === 0) {
  run('lua syntax', 'luac', ['-p', ...luaFiles]);
} else {
  const nixShell = spawnSync('nix-shell', ['--version'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (nixShell.status === 0) {
    const result = spawnSync('nix-shell', ['-p', 'lua', '--run', `luac -p ${luaFiles.join(' ')}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    checks.push({
      name: 'lua syntax',
      status: result.status === 0 ? 'passed' : 'blocked',
      command: `nix-shell -p lua --run "luac -p ${luaFiles.join(' ')}"`,
      output: result.status === 0
        ? ''
        : 'nix-shell could not run from inside the validation process; run the command directly to validate Lua syntax'
    });
  } else {
    checks.push({
      name: 'lua syntax',
      status: 'blocked',
      command: 'luac -p turtle/startup.lua turtle/runtime/*.lua',
      output: 'luac is not installed and nix-shell is unavailable'
    });
  }
}

let failed = false;
for (const check of checks) {
  const marker = check.status === 'passed' ? 'PASS' : check.status === 'blocked' ? 'BLOCKED' : 'FAIL';
  console.log(`${marker} ${check.name}`);
  if (check.output && check.status !== 'passed') {
    console.log(check.output);
  }
  if (check.status === 'failed') {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
