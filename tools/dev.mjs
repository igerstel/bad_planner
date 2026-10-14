import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const go = process.argv[2] || 'go';
const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  const timeout = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 5000);
  timeout.unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

function launch(name, command, args, cwd, service = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', line => console.log(`[${name}] ${line}`));
    }
    child.on('error', error => {
      children.delete(child);
      reject(error);
      if (service) stop(1);
    });
    child.on('close', (code, signal) => {
      children.delete(child);
      if (stopping) { resolve(); return; }
      if (service) {
        console.error(`[dev] ${name} stopped (${signal || code}). Stopping both servers.`);
        stop(code || 1);
        resolve();
      } else if (code === 0) resolve();
      else reject(new Error(`${name} failed (${signal || code}).`));
    });
  });
}

try {
  const compiler = spawnSync(go, ['version'], { cwd: root, encoding: 'utf8' });
  if (compiler.error || compiler.status !== 0) {
    throw new Error('Go was not found. On macOS run: brew install go. Then reopen your terminal.');
  }
  const vite = join(root, 'web/node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) throw new Error('Frontend dependencies are missing. Run: make install');
  mkdirSync(join(root, '.tools'), { recursive: true });
  const binary = join(root, '.tools', process.platform === 'win32' ? 'dev-api.exe' : 'dev-api');
  console.log(`[dev] ${compiler.stdout.trim()}`);
  console.log('[dev] Building API…');
  // Run the built API directly so Ctrl+C cannot leave a go-run child server behind.
  await launch('build', go, ['build', '-o', binary, '.'], join(root, 'backend'));
  if (!stopping) {
    console.log('[dev] Open http://localhost:5173 · Ctrl+C stops both servers.');
    console.log('[dev] React reloads automatically. Restart make dev after Go changes.');
    await Promise.all([
      launch('api', binary, [], join(root, 'backend'), true),
      launch('web', process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], join(root, 'web'), true),
    ]);
  }
} catch (error) {
  if (!stopping) console.error(`[dev] ${error.message}`);
  stop(1);
}
