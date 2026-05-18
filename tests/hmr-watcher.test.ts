import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatcher, type Watcher } from '../src/core/hmr/watcher.js';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

describe('createWatcher', () => {
  let dir: string;
  let watcher: Watcher | null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ef-watch-'));
    watcher = null;
  });

  afterEach(async () => {
    await watcher?.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('emits "unlink" for a file that existed when the watcher started', async () => {
    const file = join(dir, 'gone.ts');
    writeFileSync(file, 'a');
    watcher = createWatcher(dir);
    const events: Array<[string, string]> = [];
    watcher.on('add', (f) => events.push(['add', f]));
    watcher.on('change', (f) => events.push(['change', f]));
    watcher.on('unlink', (f) => events.push(['unlink', f]));
    await sleep(60);

    rmSync(file);
    await sleep(250);

    expect(events.some(([t, f]) => t === 'unlink' && f.endsWith('gone.ts'))).toBe(true);
  });

  it('returns a no-op watcher and invokes onUnsupported when the recursive watch fails', async () => {
    // A non-existent path causes node:fs.watch to throw — exercises the catch
    // branch. The watcher should still resolve cleanly and report the reason
    // via onUnsupported so the dev server can surface a warning instead of
    // silently failing.
    const onUnsupported = vi.fn();
    watcher = createWatcher(join(dir, 'does-not-exist'), { onUnsupported });
    expect(typeof watcher.close).toBe('function');
    // Registering listeners on the no-op watcher must not throw.
    watcher.on('change', () => {});
    expect(onUnsupported).toHaveBeenCalled();
  });
});
