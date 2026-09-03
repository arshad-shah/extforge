import { describe, expect, it, vi } from 'vitest';
import {
  createReloadRelayMessage,
  createServiceWorkerReloadRelay,
  formatReloadLog,
  isCompatibleEnvelope,
  isReloadRelayMessage,
  nextBackoffDelay,
  RELOAD_RELAY_TYPE,
  requestExtensionReload,
  shouldClientReload,
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
    expect(formatReloadLog({ type: 'js', files: ['a.js', 'b.js'], durationMs: 38 }, 3)).toContain(
      '3 clients',
    );
  });
  it('uses raw type as fallback for unknown reasons', () => {
    const line = formatReloadLog({ type: 'unknown-future' as any, files: ['x'], durationMs: 1 }, 1);
    expect(line).toContain('unknown-future');
  });
});

// ─── issue #88: the reload relay ─────────────────────────────────────────────

describe('reload relay message', () => {
  it('round-trips through create/is', () => {
    const msg = createReloadRelayMessage('manifest');
    expect(msg).toEqual({ type: RELOAD_RELAY_TYPE, reason: 'manifest' });
    expect(isReloadRelayMessage(msg)).toBe(true);
  });
  it('rejects anything that is not a relay message', () => {
    expect(isReloadRelayMessage(null)).toBe(false);
    expect(isReloadRelayMessage(undefined)).toBe(false);
    expect(isReloadRelayMessage('extforge:hmr-reload')).toBe(false);
    expect(isReloadRelayMessage({ type: 'other' })).toBe(false);
    // A user's own message must pass straight through to their listener.
    expect(isReloadRelayMessage({ type: 'GET_STATE', payload: 1 })).toBe(false);
  });
});

describe('requestExtensionReload', () => {
  it('reloads directly when the context owns chrome.runtime.reload', () => {
    const reloadExtension = vi.fn();
    const sendMessage = vi.fn();
    const reloadPage = vi.fn();
    expect(requestExtensionReload('manifest', { reloadExtension, sendMessage, reloadPage })).toBe(
      'direct',
    );
    expect(reloadExtension).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('relays to the worker from a content script (no runtime.reload there)', () => {
    const sendMessage = vi.fn();
    const reloadPage = vi.fn();
    expect(requestExtensionReload('full-reload', { sendMessage, reloadPage })).toBe('relayed');
    expect(sendMessage).toHaveBeenCalledWith({
      type: RELOAD_RELAY_TYPE,
      reason: 'full-reload',
    });
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('falls through to the relay when runtime.reload throws (dead context)', () => {
    const reloadExtension = vi.fn(() => {
      throw new Error('Extension context invalidated.');
    });
    const sendMessage = vi.fn();
    const warn = vi.fn();
    expect(
      requestExtensionReload('manifest', {
        reloadExtension,
        sendMessage,
        reloadPage: vi.fn(),
        warn,
      }),
    ).toBe('relayed');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('degrades to a page reload, loudly, when no relay target is reachable', () => {
    const sendMessage = vi.fn(() => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    const reloadPage = vi.fn();
    const warn = vi.fn();
    expect(requestExtensionReload('full-reload', { sendMessage, reloadPage, warn })).toBe(
      'page-reload',
    );
    expect(reloadPage).toHaveBeenCalledOnce();
    // The one failure mode we must never ship is a silent dev loop.
    expect(warn.mock.calls[0]?.[0]).toMatch(/manually/);
  });

  it('does not relay when the caller withholds sendMessage (v3 fallback path)', () => {
    const reloadPage = vi.fn();
    expect(requestExtensionReload('hmr-update', { reloadPage })).toBe('page-reload');
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('warns instead of failing silently when nothing at all is available', () => {
    const warn = vi.fn();
    expect(requestExtensionReload('full-reload', { warn })).toBe('unavailable');
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('createServiceWorkerReloadRelay', () => {
  it('reloads the extension on a full-reload relay', () => {
    const reload = vi.fn();
    const handler = createServiceWorkerReloadRelay({ reload });
    expect(handler(createReloadRelayMessage('full-reload'))).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads on a manifest relay too', () => {
    const reload = vi.fn();
    expect(createServiceWorkerReloadRelay({ reload })(createReloadRelayMessage('manifest'))).toBe(
      true,
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it('ignores unrelated messages so user listeners still see them', () => {
    const reload = vi.fn();
    const handler = createServiceWorkerReloadRelay({ reload });
    expect(handler({ type: 'GET_STATE' })).toBe(false);
    expect(handler(undefined)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once even though every open tab relays the same change', () => {
    const reload = vi.fn();
    const handler = createServiceWorkerReloadRelay({ reload });
    handler(createReloadRelayMessage('full-reload'));
    handler(createReloadRelayMessage('full-reload'));
    handler(createReloadRelayMessage('manifest'));
    expect(reload).toHaveBeenCalledOnce();
  });
});
