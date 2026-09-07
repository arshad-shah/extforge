/**
 * A minimal WebDriver BiDi client, for installing an add-on into Firefox.
 *
 * Firefox has no CDP and no command-line switch for loading an unpacked
 * add-on. It has two debugging servers, and only one of them still works:
 *
 * - The **devtools server** (`-start-debugger-server`, RDP) is what `web-ext`
 *   drives. The flag is still listed in `--help` on Firefox 155 and the port
 *   never opens, with `devtools.debugger.remote-enabled` set or not — so
 *   anything built on it fails silently, exactly like Chrome's
 *   `--load-extension`.
 * - The **Remote Agent** (`--remote-debugging-port`) speaks WebDriver BiDi,
 *   which has `webExtension.install`. That is what this uses.
 *
 * A BiDi-installed add-on is temporary: it lives as long as the browser, which
 * is what lets it be unsigned, and matches what `Extensions.loadUnpacked`
 * gives on the Chromium side.
 */

interface Pending {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export class FirefoxBidi {
  #socket: Pick<WebSocket, 'send' | 'addEventListener' | 'close'>;
  #nextId = 0;
  #pending = new Map<number, Pending>();

  /**
   * Not private, so a test can hand in a stub.
   *
   * Node has a WebSocket client and no server, so a faithful end-to-end test
   * would mean hand-rolling the server handshake — a lot of scaffolding to
   * prove message dispatch. This takes anything with `send` and
   * `addEventListener`, which is all this class uses.
   */
  constructor(socket: Pick<WebSocket, 'send' | 'addEventListener' | 'close'>) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      let message: {
        id?: number;
        type?: string;
        error?: string;
        message?: string;
        result?: Record<string, unknown>;
      };
      try {
        message = JSON.parse(String((event as MessageEvent).data));
      } catch {
        return;
      }
      if (typeof message.id !== 'number') return; // An event, not a reply.
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.type === 'error') {
        pending.reject(new Error(`${message.error ?? 'error'}: ${message.message ?? ''}`.trim()));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  }

  /**
   * Connects, retrying until the Remote Agent is up.
   *
   * Firefox opens the port some way into startup, so early attempts are
   * expected to fail. This is a wait, not an error.
   */
  static async connect(
    port: number,
    timeoutMs = 30_000,
    /**
     * Stops waiting early when this returns true.
     *
     * A browser that failed to start will never answer, and without this the
     * dev server sits for the whole timeout before saying so — half a minute
     * of nothing, on the one path where something has already gone wrong.
     */
    hasExited: () => boolean = () => false,
  ): Promise<FirefoxBidi> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (hasExited()) {
        throw new Error('Firefox exited before its Remote Agent accepted a connection.');
      }
      try {
        const socket = await new Promise<WebSocket>((resolve, reject) => {
          const s = new WebSocket(`ws://127.0.0.1:${port}/session`);
          const onOpen = (): void => {
            s.removeEventListener('error', onError);
            resolve(s);
          };
          const onError = (): void => reject(new Error('WebSocket refused'));
          s.addEventListener('open', onOpen, { once: true });
          s.addEventListener('error', onError, { once: true });
        });
        return new FirefoxBidi(socket);
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    throw new Error(`Could not reach Firefox's Remote Agent on port ${port}: ${String(lastError)}`);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 20_000,
  ): Promise<Record<string, unknown>> {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`BiDi command ${method} timed out after ${timeoutMs}ms`));
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
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Opens a session and installs the unpacked add-on. Returns its id. */
  async installAddon(path: string): Promise<string | undefined> {
    // Every other command needs a session, including this one.
    await this.send('session.new', { capabilities: {} });
    const result = await this.send('webExtension.install', {
      extensionData: { type: 'path', path },
    });
    const extension = result.extension;
    return typeof extension === 'string' ? extension : undefined;
  }

  close(): void {
    try {
      this.#socket.close();
    } catch {
      // Already gone.
    }
  }
}

/**
 * The preferences a fresh profile needs.
 *
 * None of these are about the Remote Agent, which the command-line switch
 * turns on by itself. They are about a browser nobody is sitting in front of:
 * no default-browser prompt, no onboarding tour, no data-reporting question,
 * and unsigned add-ons allowed.
 */
export const FIREFOX_DEV_PREFS: Record<string, string | boolean | number> = {
  // A temporary add-on is exempt from signing, but a profile that insists on
  // it refuses before it gets that far.
  'xpinstall.signatures.required': false,

  // Nothing should interrupt a browser opened by a dev server: no
  // default-browser prompt, no onboarding tour, no "what's new" page on the
  // first run after an update, and no telemetry question.
  'browser.shell.checkDefaultBrowser': false,
  'browser.aboutwelcome.enabled': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'datareporting.policy.dataSubmissionEnabled': false,
  'browser.startup.homepage': 'about:blank',

  /*
   * No updating, of the browser or of add-ons.
   *
   * An update that lands mid-session restarts the browser and takes the
   * temporary add-on with it — the extension disappears and nothing says
   * why. `web-ext` disables both for the same reason.
   */
  'app.update.enabled': false,
  'extensions.update.enabled': false,
  'extensions.update.notifyUser': false,
};

/** Renders preferences as a `user.js`. */
export function renderUserJs(prefs: Record<string, string | boolean | number>): string {
  return `${Object.entries(prefs)
    .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
    .join('\n')}\n`;
}
