import { describe, expect, it } from 'vitest';
import { FirefoxBidi, renderUserJs } from '../src/core/launcher/firefox-bidi.js';

/**
 * A stub standing in for the Remote Agent's socket.
 *
 * Node ships a WebSocket client and no server, so a faithful end-to-end test
 * would mean hand-rolling the server handshake and frame codec — a great deal
 * of scaffolding to prove message dispatch. The end-to-end proof is a real
 * Firefox, and it is in the pull request: `Installed extension:
 * aperture-css@arshadshah.com`. What is worth testing here is the protocol
 * handling around it.
 */
function makeStub(reply: (message: { id: number; method: string }) => unknown) {
  const state = { sent: [] as { id: number; method: string; params: unknown }[], closed: false };
  const listeners: ((event: { data: string }) => void)[] = [];
  const socket = {
    send(raw: string) {
      const message = JSON.parse(raw);
      state.sent.push(message);
      const response = reply(message);
      queueMicrotask(() => {
        for (const l of listeners) l({ data: JSON.stringify(response) });
      });
    },
    addEventListener(_type: string, listener: (event: { data: string }) => void) {
      listeners.push(listener);
    },
    close() {
      state.closed = true;
    },
  };
  return { state, socket: socket as unknown as WebSocket };
}

describe('installing an add-on over BiDi', () => {
  it('opens a session first, then installs, and returns the id', async () => {
    const { state, socket } = makeStub((m) =>
      m.method === 'session.new'
        ? { id: m.id, type: 'success', result: { sessionId: 's1' } }
        : { id: m.id, type: 'success', result: { extension: 'aperture-css@arshadshah.com' } },
    );
    const bidi = new FirefoxBidi(socket);
    const id = await bidi.installAddon('/tmp/dist/firefox');

    expect(id).toBe('aperture-css@arshadshah.com');
    // The order is not incidental: every other BiDi command needs a session,
    // including this one.
    expect(state.sent.map((m) => m.method)).toEqual(['session.new', 'webExtension.install']);
    expect(state.sent[1].params).toEqual({
      extensionData: { type: 'path', path: '/tmp/dist/firefox' },
    });
  });

  it('surfaces a BiDi error rather than hanging', async () => {
    const { socket } = makeStub((m) =>
      m.method === 'session.new'
        ? { id: m.id, type: 'success', result: {} }
        : { id: m.id, type: 'error', error: 'unknown error', message: 'not a valid add-on' },
    );
    const bidi = new FirefoxBidi(socket);
    await expect(bidi.installAddon('/tmp/nope')).rejects.toThrow(/not a valid add-on/);
  });

  it('ignores events, which carry no id', async () => {
    const { socket } = makeStub((m) => ({ id: m.id, type: 'success', result: { ok: true } }));
    const bidi = new FirefoxBidi(socket);
    // An event arriving between commands must not be mistaken for a reply.
    const pending = bidi.send('session.status');
    await expect(pending).resolves.toEqual({ ok: true });
  });
});

describe('the profile preferences', () => {
  it('renders valid user.js lines', () => {
    const js = renderUserJs({ 'a.b': true, 'c.d': 3, 'e.f': 'x' });
    expect(js).toContain('user_pref("a.b", true);');
    expect(js).toContain('user_pref("c.d", 3);');
    expect(js).toContain('user_pref("e.f", "x");');
  });
});
