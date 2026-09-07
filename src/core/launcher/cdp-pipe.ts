/**
 * A minimal CDP client, speaking over Chrome's remote-debugging pipe.
 *
 * This exists for one command — `Extensions.loadUnpacked` — and that one
 * command is the only way to install an unpacked extension into a modern
 * branded Chrome. `--load-extension` was removed in Chrome 137: it is
 * accepted, ignored, and nothing tells you. A browser opens, it looks
 * completely normal, and the extension is not in it.
 *
 * ## Why a pipe and not a port
 *
 * `--remote-debugging-port` would be less code — an HTTP GET for the
 * WebSocket URL and a socket. It also opens an **unauthenticated** endpoint:
 * anything on the machine that can reach it can drive the browser and read
 * whatever the profile is logged into. Loading an extension is something
 * ExtForge does on every `dev --open`, so paying that cost by default is not
 * on. `--remote-debugging-pipe` puts the same protocol on two inherited file
 * descriptors that only this process holds.
 *
 * `dev --debug-port` still opens a port, because there the developer has
 * asked for one and knows what it is for.
 *
 * ## The framing
 *
 * JSON objects, each terminated by a NUL byte, on fd 3 (we write) and fd 4
 * (Chrome writes). That is the whole protocol.
 */

import type { ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

/** File descriptors Chrome uses for `--remote-debugging-pipe`. */
export const CDP_PIPE_STDIO = ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] as const;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class CdpPipe {
  #outgoing: Writable;
  #buffer = '';
  #nextId = 0;
  #pending = new Map<number, Pending>();
  #closed = false;

  constructor(child: ChildProcess) {
    const outgoing = child.stdio[3] as Writable | null;
    const incoming = child.stdio[4] as Readable | null;
    if (!outgoing || !incoming) {
      throw new Error('Browser was not spawned with the CDP pipe file descriptors.');
    }
    this.#outgoing = outgoing;

    incoming.setEncoding('utf8');
    incoming.on('data', (chunk: string) => {
      this.#buffer += chunk;
      let end = this.#buffer.indexOf('\0');
      while (end !== -1) {
        const raw = this.#buffer.slice(0, end);
        this.#buffer = this.#buffer.slice(end + 1);
        this.#dispatch(raw);
        end = this.#buffer.indexOf('\0');
      }
    });
    const fail = (): void => this.#failAll('The browser closed the CDP pipe.');
    incoming.on('close', fail);
    incoming.on('error', fail);
  }

  #dispatch(raw: string): void {
    let message: { id?: number; error?: { message?: string }; result?: unknown };
    try {
      message = JSON.parse(raw);
    } catch {
      // An event we cannot parse is not worth failing a command over.
      return;
    }
    // Events have no `id`. Nothing here subscribes to any, so they are dropped.
    if (typeof message.id !== 'number') return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message ?? 'CDP error'));
    else pending.resolve(message.result);
  }

  #failAll(reason: string): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const [, pending] of this.#pending) pending.reject(new Error(reason));
    this.#pending.clear();
  }

  /**
   * Sends one command and waits for its reply.
   *
   * Every command gets a response, so a timeout means the browser died
   * without closing the pipe — rare, and indistinguishable from a hang
   * without one.
   */
  send(method: string, params: Record<string, unknown>, timeoutMs = 10_000): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error('CDP pipe is closed.'));
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#outgoing.write(`${JSON.stringify({ id, method, params })}\0`);
    });
  }

  close(): void {
    this.#failAll('CDP pipe closed by the caller.');
  }
}

/**
 * Chrome 125 and older answer this exact string when a method does not
 * exist. It is the signal to relaunch with `--load-extension`, which those
 * versions still honour.
 */
export function isUnknownCdpMethod(error: unknown): boolean {
  return error instanceof Error && /wasn't found/.test(error.message);
}
