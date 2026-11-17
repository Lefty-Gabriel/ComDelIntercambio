import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = process.env.COMMUNITY_FRONTEND_DIR
  ? resolve(root, process.env.COMMUNITY_FRONTEND_DIR)
  : resolve(homedir(), '.gemini/antigravity-ide/scratch/traction-frontend');
const manifest = resolve(frontend, 'package.json');
if (!existsSync(manifest) || JSON.parse(readFileSync(manifest, 'utf8')).name !== 'traction-frontend') {
  throw new Error('Configura COMMUNITY_FRONTEND_DIR con la carpeta de traction-frontend. El portal de pruebas fue retirado.');
}
const action = process.argv[2] || 'dev';
if (!['dev', 'build', 'preview', 'lint'].includes(action)) throw new Error('Unsupported frontend action');
const vite = resolve(frontend, 'node_modules/vite/bin/vite.js');
const args = action === 'lint'
  ? [resolve(frontend, 'node_modules/oxlint/bin/oxlint')]
  : action === 'dev' ? [resolve(frontend, 'scripts/start.mjs')]
  : [vite, action, ...(action === 'preview' ? ['--port', '5174', '--strictPort'] : [])];
const child = spawn(process.execPath, args, { cwd: frontend, stdio: 'inherit', env: process.env });
child.on('error', () => { console.error('No se pudo iniciar Comunidad. Instala las dependencias de traction-frontend.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
