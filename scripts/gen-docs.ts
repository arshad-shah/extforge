import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'pathe';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const steps = [
  'gen-brand-css.ts',
  'gen-config-reference.ts',
  'gen-error-codes.ts',
  'gen-plugin-reference.ts',
];

for (const s of steps) {
  console.log(`-> ${s}`);
  const res = spawnSync('tsx', [resolve(__dirname, s)], { stdio: 'inherit', cwd: root });
  if (res.status !== 0) {
    console.error(`generator ${s} exited with code ${res.status}`);
    process.exit(res.status ?? 1);
  }
}
console.log('docs generation complete');
