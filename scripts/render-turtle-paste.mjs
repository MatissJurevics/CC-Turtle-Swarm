import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'turtle', 'startup.lua');
const startup = await readFile(source, 'utf8');

console.log('-- Paste this into a turtle as /startup.lua');
console.log('-- It creates /fleet/config.lua on first run, then expects runtime files under /fleet/runtime.');
console.log(startup);

