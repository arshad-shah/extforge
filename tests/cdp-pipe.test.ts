import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CDP_PIPE_STDIO, CdpPipe, isUnknownCdpMethod } from '../src/core/launcher/cdp-pipe.js';

/**
 * The pipe protocol, against a stand-in that speaks it.
 *
 * A real Chrome is not needed to test the framing, and using one would make
 * this a test of whatever Chrome happens to be installed. What matters here
 * is that NUL-terminated JSON goes out, replies are matched to their command
 * by id, and an error comes back as a rejection — the three things that
 * decide whether `Extensions.loadUnpacked` reaches the browser.
 */
function fakeBrowser(script: string) {
  return spawn(process.execPath, ['-e', script], { stdio: [...CDP_PIPE_STDIO] });
}

/** Echoes every command back as a successful result. */
const ECHO = `
  const chunks = [];
  const incoming = require('fs').createReadStream(null, { fd: 3 });
  const outgoing = require('fs').createWriteStream(null, { fd: 4 });
  let buf = '';
  incoming.setEncoding('utf8');
  incoming.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\\0')) !== -1) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      outgoing.write(JSON.stringify({ id: msg.id, result: { echoed: msg.method } }) + '\\0');
    }
  });
  setTimeout(() => {}, 5000);
`;

/** Answers exactly as Chrome 125 does for a method it does not have. */
const NO_METHOD = `
  const incoming = require('fs').createReadStream(null, { fd: 3 });
  const outgoing = require('fs').createWriteStream(null, { fd: 4 });
  let buf = '';
  incoming.setEncoding('utf8');
  incoming.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\\0')) !== -1) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      outgoing.write(JSON.stringify({
        id: msg.id,
        error: { code: -32601, message: "'" + msg.method + "' wasn't found" },
      }) + '\\0');
    }
  });
  setTimeout(() => {}, 5000);
`;

describe('the CDP pipe', () => {
  it('sends a command and resolves its reply', async () => {
    const child = fakeBrowser(ECHO);
    try {
      const cdp = new CdpPipe(child);
      const result = await cdp.send('Extensions.loadUnpacked', { path: '/tmp/ext' });
      expect(result).toEqual({ echoed: 'Extensions.loadUnpacked' });
      cdp.close();
    } finally {
      child.kill();
    }
  });

  it('matches replies to commands by id, not by arrival order', async () => {
    const child = fakeBrowser(ECHO);
    try {
      const cdp = new CdpPipe(child);
      const [a, b] = await Promise.all([cdp.send('A', {}), cdp.send('B', {})]);
      expect(a).toEqual({ echoed: 'A' });
      expect(b).toEqual({ echoed: 'B' });
      cdp.close();
    } finally {
      child.kill();
    }
  });

  it('rejects on a CDP error, recognisably', async () => {
    const child = fakeBrowser(NO_METHOD);
    try {
      const cdp = new CdpPipe(child);
      const err = await cdp.send('Extensions.loadUnpacked', {}).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      // This exact shape is what decides whether the launcher falls back to
      // `--load-extension` or reports a failure, so it is worth pinning.
      expect(isUnknownCdpMethod(err)).toBe(true);
      cdp.close();
    } finally {
      child.kill();
    }
  });

  it('does not mistake an ordinary failure for a missing method', () => {
    expect(isUnknownCdpMethod(new Error('Failed to load extension: manifest is invalid'))).toBe(
      false,
    );
  });

  it('fails clearly when the browser was not given the pipe descriptors', () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},1000)'], { stdio: 'ignore' });
    try {
      expect(() => new CdpPipe(child)).toThrow(/CDP pipe file descriptors/);
    } finally {
      child.kill();
    }
  });
});
