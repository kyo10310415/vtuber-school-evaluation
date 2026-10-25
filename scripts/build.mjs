import { cp, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../dist/static/', import.meta.url), { recursive: true });
await cp(new URL('../public/static/', import.meta.url), new URL('../dist/static/', import.meta.url), { recursive: true });

// The Render Node server needs neither Vite nor the Cloudflare deployment CLI.
// Keep local/Cloudflare workflows intact; remove tooling only from Render's artifact.
if (process.env.RENDER === 'true') {
  if (!process.env.npm_execpath) throw new Error('Run this build through npm');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'prune', '--omit=dev', '--ignore-scripts', '--no-audit'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
