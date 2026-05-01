import { describe, it, expect } from 'vitest';
import {
  shouldClientReload,
  nextBackoffDelay,
  isCompatibleEnvelope,
  formatReloadLog,
} from '../src/core/hmr/client-logic.js';

describe('shouldClientReload', () => {
  it('reloads when no scriptIds field (broad change)', () => {
    expect(shouldClientReload({ type: 'js', files: [] }, undefined)).toBe(true);
    expect(shouldClientReload({ type: 'js', files: [], scriptIds: undefined }, 0)).toBe(true);
  });
  it('reloads only when own scriptId is included', () => {
    expect(shouldClientReload({ type: 'js', files: [], scriptIds: [0, 2] }, 0)).toBe(true);
    expect(shouldClientReload({ type: 'js', files: [], scriptIds: [0, 2] }, 1)).toBe(false);
  });
  it('non-js types always reload (server already filtered)', () => {
    expect(shouldClientReload({ type: 'full-reload', files: [] }, 1)).toBe(true);
  });
  it('clients without an ownScriptId reload on broad js even when scriptIds provided', () => {
    // background/popup-class clients dont have OWN_SCRIPT_ID; reload to be safe
    expect(shouldClientReload({ type: 'js', files: [], scriptIds: [0] }, undefined)).toBe(true);
  });
});

describe('nextBackoffDelay', () => {
  it('grows exponentially up to 8000ms', () => {
    expect(nextBackoffDelay(1)).toBe(250);
    expect(nextBackoffDelay(2)).toBe(500);
    expect(nextBackoffDelay(3)).toBe(1000);
    expect(nextBackoffDelay(4)).toBe(2000);
    expect(nextBackoffDelay(5)).toBe(4000);
    expect(nextBackoffDelay(6)).toBe(8000);
    expect(nextBackoffDelay(50)).toBe(8000);
  });
  it('clamps non-positive attempts to first delay', () => {
    expect(nextBackoffDelay(0)).toBe(250);
    expect(nextBackoffDelay(-5)).toBe(250);
  });
});

describe('isCompatibleEnvelope', () => {
  it('accepts undefined v (legacy v1)', () => {
    expect(isCompatibleEnvelope({ type: 'js', files: [] })).toBe(true);
  });
  it('accepts current v', () => {
    expect(isCompatibleEnvelope({ v: 2, type: 'js', files: [] })).toBe(true);
  });
  it('rejects future v', () => {
    expect(isCompatibleEnvelope({ v: 99, type: 'js', files: [] })).toBe(false);
  });
});

describe('formatReloadLog', () => {
  it('produces the canonical one-line format', () => {
    const line = formatReloadLog({ type: 'css', files: ['a.css'], durationMs: 12 }, 1);
    expect(line).toBe('[hmr] reloaded a.css — css hot swap — 12ms (1 client)');
  });
  it('pluralizes correctly', () => {
    expect(formatReloadLog({ type: 'js', files: ['a.js', 'b.js'], durationMs: 38 }, 3))
      .toContain('3 clients');
  });
  it('uses raw type as fallback for unknown reasons', () => {
    const line = formatReloadLog({ type: 'unknown-future' as any, files: ['x'], durationMs: 1 }, 1);
    expect(line).toContain('unknown-future');
  });
});
