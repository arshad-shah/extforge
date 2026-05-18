import { ExtForgeError } from '../errors/index.js';
import { ERROR_CODES } from '../errors/codes.js';
import type { Browser } from '../manifest/index.js';
import type { BuildResult } from '../builder/index.js';
import type { HMRUpdate } from '../hmr/index.js';
import type { ExtForgeConfig } from '../config.js';
import {
  type ExtForgePlugin,
  type ExtForgePluginV1,
  type ExtForgePluginLegacy,
  type PluginContext,
  type PluginHooks,
  type EntryDescriptor,
  type ManifestObject,
  isV1Plugin,
} from './types.js';

type RunnerCtx = Omit<PluginContext, 'hooks'>;

interface HookRegistry {
  configResolved: Array<(c: ExtForgeConfig) => void | Promise<void>>;
  manifestTransform: Array<(m: ManifestObject, b: Browser) => ManifestObject | Promise<ManifestObject>>;
  buildStart: Array<(info: { browser: Browser; dev: boolean }) => void | Promise<void>>;
  buildEntry: Array<(e: EntryDescriptor) => EntryDescriptor | void | Promise<EntryDescriptor | void>>;
  buildEnd: Array<(r: BuildResult) => void | Promise<void>>;
  devReload: Array<(e: HMRUpdate) => void | Promise<void>>;
}

function adaptLegacy(p: ExtForgePluginLegacy): ExtForgePluginV1 {
  return {
    name: p.name,
    apiVersion: 1,
    async setup(ctx) {
      if (p.setup) await p.setup(ctx.config);
      if (p.buildStart) ctx.hooks.onBuildStart(() => p.buildStart!());
      if (p.buildEnd)   ctx.hooks.onBuildEnd((r) => p.buildEnd!(r));
    },
  };
}

function pluginFailed(pluginName: string, hookName: string, err: unknown): ExtForgeError {
  const msg = err instanceof Error ? err.message : String(err);
  return new ExtForgeError({
    code: ERROR_CODES.EXT_PLUGIN_FAILED,
    message: `Plugin "${pluginName}" failed in ${hookName}: ${msg}`,
    hint: msg,
    cause: err,
  });
}

function wrap<F extends (...args: any[]) => any>(plugin: string, hook: string, fn: F): F {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (err) {
      throw pluginFailed(plugin, hook, err);
    }
  }) as F;
}

export class PluginRunner {
  private hooks: HookRegistry = {
    configResolved: [],
    manifestTransform: [],
    buildStart: [],
    buildEntry: [],
    buildEnd: [],
    devReload: [],
  };

  readonly plugins: ReadonlyArray<ExtForgePluginV1>;

  constructor(plugins: ExtForgePlugin[], private ctx: RunnerCtx) {
    this.plugins = plugins.map(p => isV1Plugin(p) ? p : adaptLegacy(p));
  }

  async setup(): Promise<void> {
    for (const p of this.plugins) {
      const pluginHooks: PluginHooks = {
        onConfigResolved:    (fn) => { this.hooks.configResolved.push(wrap(p.name, 'onConfigResolved', fn)); },
        onManifestTransform: (fn) => { this.hooks.manifestTransform.push(wrap(p.name, 'onManifestTransform', fn)); },
        onBuildStart:        (fn) => { this.hooks.buildStart.push(wrap(p.name, 'onBuildStart', fn)); },
        onBuildEntry:        (fn) => { this.hooks.buildEntry.push(wrap(p.name, 'onBuildEntry', fn)); },
        onBuildEnd:          (fn) => { this.hooks.buildEnd.push(wrap(p.name, 'onBuildEnd', fn)); },
        onDevReload:         (fn) => { this.hooks.devReload.push(wrap(p.name, 'onDevReload', fn)); },
      };
      const ctx: PluginContext = { ...this.ctx, hooks: pluginHooks };
      try {
        await p.setup(ctx);
      } catch (err) {
        throw pluginFailed(p.name, 'setup', err);
      }
    }
  }

  async fireConfigResolved(config: ExtForgeConfig): Promise<void> {
    for (const fn of this.hooks.configResolved) await fn(config);
  }

  async fireManifestTransform(manifest: ManifestObject, browser: Browser): Promise<ManifestObject> {
    let m = manifest;
    for (const fn of this.hooks.manifestTransform) {
      const next = await fn(m, browser);
      // A plugin returning `null`, `undefined`, or a non-object means
      // "no change requested" — keep the prior manifest. Replacing with
      // null/undefined here used to crash every downstream plugin (and the
      // manifest writer) on its first property access.
      if (next && typeof next === 'object') m = next;
    }
    return m;
  }

  async fireBuildStart(info: { browser: Browser; dev: boolean }): Promise<void> {
    for (const fn of this.hooks.buildStart) await fn(info);
  }

  async fireBuildEntry(entry: EntryDescriptor): Promise<EntryDescriptor> {
    let e = entry;
    for (const fn of this.hooks.buildEntry) {
      const next = await fn(e);
      if (next) e = next;
    }
    return e;
  }

  async fireBuildEnd(result: BuildResult): Promise<void> {
    for (const fn of this.hooks.buildEnd) await fn(result);
  }

  async fireDevReload(event: HMRUpdate): Promise<void> {
    for (const fn of this.hooks.devReload) await fn(event);
  }
}
