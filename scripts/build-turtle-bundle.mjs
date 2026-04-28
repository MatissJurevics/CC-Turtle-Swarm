import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist', 'turtle-bundle');

const files = [
  ['turtle/startup.lua', 'startup.lua'],
  ['turtle/runtime/config.lua', 'fleet/runtime/config.lua'],
  ['turtle/runtime/logger.lua', 'fleet/runtime/logger.lua'],
  ['turtle/runtime/spool.lua', 'fleet/runtime/spool.lua'],
  ['turtle/runtime/actuator.lua', 'fleet/runtime/actuator.lua'],
  ['turtle/runtime/transport.lua', 'fleet/runtime/transport.lua'],
  ['turtle/runtime/watchdog.lua', 'fleet/runtime/watchdog.lua'],
  ['turtle/runtime/executor.lua', 'fleet/runtime/executor.lua'],
  ['turtle/runtime/odometry.lua', 'fleet/runtime/odometry.lua'],
  ['turtle/runtime/scanner.lua', 'fleet/runtime/scanner.lua'],
  ['turtle/runtime/main.lua', 'fleet/runtime/main.lua']
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const [source, target] of files) {
  const sourcePath = path.join(root, source);
  const targetPath = path.join(outDir, target);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await readFile(sourcePath, 'utf8'));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  installRoot: '/',
  files: files.map(([source, target]) => ({ source, target: `/${target}` }))
};

await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Turtle bundle written to ${path.relative(root, outDir)}`);
